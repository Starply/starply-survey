import { describe, expect, it } from 'vitest';

import {
  createAccessToken,
  createRefreshToken,
  hashRefreshSecret,
  isRefreshSecretValid,
  parseRefreshToken,
  verifyAccessToken,
} from './tokens';

const secret = 'test-secret-value-at-least-32-characters';
const now = new Date('2026-11-27T12:00:00.000Z');

function token(): string {
  return createAccessToken(
    { userId: 'user-1', sessionId: 'session-1', ttlSeconds: 900, now },
    secret,
  );
}

describe('createAccessToken / verifyAccessToken', () => {
  it('生成可校验的 HS256 令牌', () => {
    const result = verifyAccessToken(token(), secret, now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('user-1');
      expect(result.claims.sid).toBe('session-1');
      expect(result.claims.exp - result.claims.iat).toBe(900);
    }
  });

  it('到达过期时间即失效', () => {
    const result = verifyAccessToken(token(), secret, new Date(now.getTime() + 900_000));

    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('拒绝被篡改的载荷与错误密钥', () => {
    const [header, , signature] = token().split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-2', sid: 's', iat: 1, exp: 2 }),
    ).toString('base64url');

    expect(verifyAccessToken(`${header}.${forgedPayload}.${signature}`, secret, now)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
    expect(verifyAccessToken(token(), 'another-secret-value-at-least-32chars', now)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('拒绝格式错误与非 HS256 算法', () => {
    expect(verifyAccessToken('a.b', secret, now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyAccessToken('', secret, now)).toEqual({ ok: false, reason: 'malformed' });

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u', sid: 's', iat: 1, exp: 2 })).toString(
      'base64url',
    );

    expect(verifyAccessToken(`${header}.${payload}.x`, secret, now)).toEqual({
      ok: false,
      reason: 'unsupported_algorithm',
    });
  });
});

describe('刷新令牌', () => {
  it('生成并解析出会话 id 与 secret', () => {
    const refreshToken = createRefreshToken('session-42');
    const parts = parseRefreshToken(refreshToken);

    expect(parts?.sessionId).toBe('session-42');
    expect(parts?.secret.length).toBeGreaterThan(20);
  });

  it('每次生成的 secret 不同', () => {
    expect(parseRefreshToken(createRefreshToken('s'))?.secret).not.toBe(
      parseRefreshToken(createRefreshToken('s'))?.secret,
    );
  });

  it('拒绝格式错误的令牌', () => {
    expect(parseRefreshToken('')).toBeNull();
    expect(parseRefreshToken('no-separator')).toBeNull();
    expect(parseRefreshToken('.secret')).toBeNull();
    expect(parseRefreshToken('session.')).toBeNull();
    expect(parseRefreshToken('session.a.b')).toBeNull();
    expect(parseRefreshToken(undefined)).toBeNull();
  });

  it('只接受匹配的 secret 哈希', () => {
    const parts = parseRefreshToken(createRefreshToken('session-1'));
    const storedHash = hashRefreshSecret(parts?.secret ?? '');

    expect(isRefreshSecretValid(parts?.secret ?? '', storedHash)).toBe(true);
    expect(isRefreshSecretValid('another-secret', storedHash)).toBe(false);
  });
});
