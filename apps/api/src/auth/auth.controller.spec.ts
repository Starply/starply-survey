import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthSessionService, type IssuedTokens } from '@starply/auth-core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from './access-token.guard';
import { AuthController } from './auth.controller';
import { SessionStoreUnavailableError } from './redis-session-store';

const issued: IssuedTokens = {
  accessToken: 'access-token',
  refreshToken: 'session-1.refresh-secret',
  expiresIn: 900,
  sessionId: 'session-1',
};

function createController(): {
  auth: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  controller: AuthController;
} {
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(async () => undefined),
  };

  return { auth, controller: new AuthController(auth as unknown as AuthSessionService) };
}

function capture<T>(action: () => Promise<unknown>): Promise<T> {
  return action().then(
    () => {
      throw new Error('预期抛出异常');
    },
    (error: unknown) => error as T,
  );
}

describe('AuthController', () => {
  it('登录成功返回 Bearer 令牌响应', async () => {
    const { auth, controller } = createController();
    auth.login.mockResolvedValue({ ok: true, tokens: issued });

    await expect(
      controller.login({ email: 'admin@example.com', password: 'secret' }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'session-1.refresh-secret',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(auth.login).toHaveBeenCalledWith('admin@example.com', 'secret');
  });

  it('凭据错误返回 401 invalid_credentials', async () => {
    const { auth, controller } = createController();
    auth.login.mockResolvedValue({ ok: false, reason: 'invalid_credentials' });

    const error = await capture<UnauthorizedException>(() =>
      controller.login({ email: 'admin@example.com', password: 'wrong' }),
    );

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'invalid_credentials' });
  });

  it('账号停用返回 403 user_disabled', async () => {
    const { auth, controller } = createController();
    auth.login.mockResolvedValue({ ok: false, reason: 'user_disabled' });

    const error = await capture<ForbiddenException>(() =>
      controller.login({ email: 'admin@example.com', password: 'secret' }),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ code: 'user_disabled' });
  });

  it('缺少登录字段返回 400 invalid_request', async () => {
    const { controller } = createController();

    const error = await capture<BadRequestException>(() => controller.login({ email: 'a@b.c' }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'invalid_request' });
  });

  it('刷新令牌重放返回 401 并提示重新登录', async () => {
    const { auth, controller } = createController();
    auth.refresh.mockResolvedValue({ ok: false, reason: 'refresh_token_reused' });

    const error = await capture<UnauthorizedException>(() =>
      controller.refresh({ refreshToken: 'session-1.old-secret' }),
    );

    expect(error.getResponse()).toEqual({
      code: 'refresh_token_reused',
      message: '刷新令牌已失效，请重新登录',
    });
  });

  it('缺少 refreshToken 返回 400 invalid_request', async () => {
    const { controller } = createController();

    await expect(capture<BadRequestException>(() => controller.refresh({}))).resolves.toMatchObject(
      { response: { code: 'invalid_request' } },
    );
  });

  it('会话存储不可用时返回 503', async () => {
    const { auth, controller } = createController();
    auth.login.mockRejectedValue(
      new SessionStoreUnavailableError(new Error('connect ECONNREFUSED')),
    );

    const error = await capture<ServiceUnavailableException>(() =>
      controller.login({ email: 'admin@example.com', password: 'secret' }),
    );

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({ code: 'session_store_unavailable' });
  });

  it('登出删除服务端会话', async () => {
    const { auth, controller } = createController();

    await expect(controller.logout({ refreshToken: 'session-1.refresh-secret' })).resolves.toBe(
      undefined,
    );
    expect(auth.logout).toHaveBeenCalledWith('session-1.refresh-secret');
  });

  it('me 返回访问令牌对应的身份', () => {
    const { controller } = createController();
    const request = {
      auth: { sub: 'user-1', sid: 'session-1', iat: 1_795_000_000, exp: 1_795_000_900 },
    } as AuthenticatedRequest;

    expect(controller.me(request)).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(1_795_000_900 * 1000).toISOString(),
    });
  });
});
