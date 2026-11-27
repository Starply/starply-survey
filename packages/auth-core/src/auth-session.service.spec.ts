import { describe, expect, it, vi } from 'vitest';

import { AuthSessionService } from './auth-session.service';
import type {
  AuthUserCredential,
  PasswordVerifier,
  UserCredentialLookup,
} from './auth-session.service';
import { InMemorySessionStore, type SessionStore, type StoredSession } from './session-store';
import { parseRefreshToken, verifyAccessToken } from './tokens';

const secret = 'test-secret-value-at-least-32-characters';
const policy = { accessTokenTtlSeconds: 900, idleTimeoutMs: 60_000, absoluteTimeoutMs: 3_600_000 };

const user: AuthUserCredential = {
  id: 'user-1',
  email: 'admin@example.com',
  passwordHash: 'hashed-password',
  status: 'active',
};

/** 忽略 TTL 的存储，用于验证过期/空闲超时的原因分类。 */
class RetainingStore implements SessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  async save(session: StoredSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async find(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async update(session: StoredSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async revoke(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

function createService(store: SessionStore = new InMemorySessionStore(() => current.getTime())) {
  const users: UserCredentialLookup = {
    findByEmail: vi.fn(async (email: string) => (email === user.email ? user : null)),
  };
  const passwords: PasswordVerifier = {
    verify: vi.fn(
      async (hash: string, plain: string) => hash === user.passwordHash && plain === 'secret',
    ),
  };

  return {
    users,
    passwords,
    service: new AuthSessionService(users, passwords, store, {
      accessTokenSecret: secret,
      policy,
      now: () => current,
    }),
  };
}

let current = new Date('2026-11-27T12:00:00.000Z');

describe('AuthSessionService.login', () => {
  it('校验通过后创建会话并签发访问/刷新令牌', async () => {
    current = new Date('2026-11-27T12:00:00.000Z');
    const store = new InMemorySessionStore(() => current.getTime());
    const { service, users } = createService(store);

    const result = await service.login('Admin@Example.com ', 'secret');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(users.findByEmail).toHaveBeenCalledWith('admin@example.com');
    expect(result.tokens.expiresIn).toBe(900);
    expect(parseRefreshToken(result.tokens.refreshToken)?.sessionId).toBe(result.tokens.sessionId);

    const verified = verifyAccessToken(result.tokens.accessToken, secret, current);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.sub).toBe('user-1');
      expect(verified.claims.sid).toBe(result.tokens.sessionId);
    }

    const stored = await store.find(result.tokens.sessionId);
    expect(stored?.userId).toBe('user-1');
    expect(stored?.expiresAt.toISOString()).toBe('2026-11-27T13:00:00.000Z');
  });

  it('未知邮箱与密码错误返回同一原因', async () => {
    const { service } = createService();

    expect(await service.login('nobody@example.com', 'secret')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
    expect(await service.login(user.email, 'wrong')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('密码正确但账号被停用时返回 user_disabled', async () => {
    const disabled = new AuthSessionService(
      { findByEmail: async () => ({ ...user, status: 'disabled' }) },
      { verify: async () => true },
      new InMemorySessionStore(),
      { accessTokenSecret: secret, policy, now: () => current },
    );

    expect(await disabled.login(user.email, 'secret')).toEqual({
      ok: false,
      reason: 'user_disabled',
    });
  });
});

describe('AuthSessionService.refresh', () => {
  it('轮换刷新令牌并延长 lastUsedAt', async () => {
    current = new Date('2026-11-27T12:00:00.000Z');
    const store = new InMemorySessionStore(() => current.getTime());
    const { service } = createService(store);

    const login = await service.login(user.email, 'secret');
    expect(login.ok).toBe(true);
    if (!login.ok) {
      return;
    }

    current = new Date('2026-11-27T12:00:30.000Z');
    const refreshed = await service.refresh(login.tokens.refreshToken);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) {
      return;
    }

    expect(refreshed.tokens.refreshToken).not.toBe(login.tokens.refreshToken);
    expect(refreshed.tokens.sessionId).toBe(login.tokens.sessionId);

    const stored = await store.find(login.tokens.sessionId);
    expect(stored?.lastUsedAt.toISOString()).toBe('2026-11-27T12:00:30.000Z');
  });

  it('旧刷新令牌重放会撤销会话', async () => {
    current = new Date('2026-11-27T12:00:00.000Z');
    const store = new InMemorySessionStore(() => current.getTime());
    const { service } = createService(store);

    const login = await service.login(user.email, 'secret');
    if (!login.ok) {
      throw new Error('login failed');
    }

    await service.refresh(login.tokens.refreshToken);

    expect(await service.refresh(login.tokens.refreshToken)).toEqual({
      ok: false,
      reason: 'refresh_token_reused',
    });
    expect(await store.find(login.tokens.sessionId)).toBeNull();
  });

  it('未知会话与格式错误的令牌返回 invalid_refresh_token', async () => {
    const { service } = createService();

    expect(await service.refresh('missing-session.secret')).toEqual({
      ok: false,
      reason: 'invalid_refresh_token',
    });
    expect(await service.refresh('broken')).toEqual({ ok: false, reason: 'invalid_refresh_token' });
  });

  it('空闲超时后拒绝并删除会话', async () => {
    current = new Date('2026-11-27T12:00:00.000Z');
    const store = new RetainingStore();
    const { service } = createService(store);

    const login = await service.login(user.email, 'secret');
    if (!login.ok) {
      throw new Error('login failed');
    }

    current = new Date('2026-11-27T12:02:00.000Z');
    expect(await service.refresh(login.tokens.refreshToken)).toEqual({
      ok: false,
      reason: 'session_idle_timeout',
    });
    expect(await store.find(login.tokens.sessionId)).toBeNull();
  });
});

describe('AuthSessionService.logout', () => {
  it('删除会话，后续刷新失败', async () => {
    current = new Date('2026-11-27T12:00:00.000Z');
    const store = new InMemorySessionStore(() => current.getTime());
    const { service } = createService(store);

    const login = await service.login(user.email, 'secret');
    if (!login.ok) {
      throw new Error('login failed');
    }

    await service.logout(login.tokens.refreshToken);
    expect(await store.find(login.tokens.sessionId)).toBeNull();
    expect((await service.refresh(login.tokens.refreshToken)).ok).toBe(false);
  });
});
