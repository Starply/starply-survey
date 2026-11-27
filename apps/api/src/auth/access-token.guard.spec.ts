import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createAccessToken } from '@starply/auth-core';
import { describe, expect, it, vi } from 'vitest';

import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard';

const secret = 'test-secret-value-at-least-32-characters';

const config = {
  getOrThrow: vi.fn(() => ({ accessTokenSecret: secret })),
} as unknown as ConfigService;

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function issueToken(ttlSeconds: number, issuedAt: Date = new Date()): string {
  return createAccessToken(
    { userId: 'user-1', sessionId: 'session-1', ttlSeconds, now: issuedAt },
    secret,
  );
}

function captureException(action: () => unknown): UnauthorizedException {
  try {
    action();
  } catch (error) {
    return error as UnauthorizedException;
  }

  throw new Error('预期抛出 UnauthorizedException');
}

describe('AccessTokenGuard', () => {
  const guard = new AccessTokenGuard(config);

  it('有效 Bearer 令牌通过并把 claims 写入请求', () => {
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${issueToken(900)}` },
    };

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(request.auth).toMatchObject({ sub: 'user-1', sid: 'session-1' });
  });

  it('缺少 Authorization 头时返回 unauthorized', () => {
    const error = captureException(() => guard.canActivate(createContext({ headers: {} })));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'unauthorized' });
  });

  it('只接受 Bearer 方案', () => {
    const error = captureException(() =>
      guard.canActivate(createContext({ headers: { authorization: `Basic ${issueToken(900)}` } })),
    );

    expect(error.getResponse()).toMatchObject({ code: 'unauthorized' });
  });

  it('过期令牌返回 token_expired', () => {
    // 用已过期的签发时间生成令牌，再以真实当前时间校验。
    const expired = issueToken(60, new Date(Date.now() - 3_600_000));

    const error = captureException(() =>
      guard.canActivate(createContext({ headers: { authorization: `Bearer ${expired}` } })),
    );

    expect(error.getResponse()).toMatchObject({ code: 'token_expired' });
  });

  it('签名不匹配返回 unauthorized', () => {
    const error = captureException(() =>
      guard.canActivate(
        createContext({ headers: { authorization: `Bearer ${issueToken(900)}x` } }),
      ),
    );

    expect(error.getResponse()).toMatchObject({ code: 'unauthorized' });
  });
});
