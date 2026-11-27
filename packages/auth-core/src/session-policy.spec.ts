import { describe, expect, it } from 'vitest';

import {
  computeSessionExpiry,
  DEFAULT_SESSION_POLICY,
  evaluateSession,
  type SessionPolicy,
} from './session-policy';

const policy: SessionPolicy = {
  accessTokenTtlSeconds: 900,
  idleTimeoutMs: 60_000,
  absoluteTimeoutMs: 3_600_000,
};

const now = new Date('2026-11-27T12:00:00.000Z');

function session(overrides: Partial<Parameters<typeof evaluateSession>[0]> = {}) {
  return {
    lastUsedAt: new Date(now.getTime() - 1_000),
    expiresAt: new Date(now.getTime() + 3_600_000),
    revokedAt: null,
    ...overrides,
  };
}

describe('evaluateSession', () => {
  it('未撤销、未过期且未空闲超时的会话可用', () => {
    expect(evaluateSession(session(), policy, now)).toEqual({ valid: true });
  });

  it('已撤销的会话立即失效', () => {
    expect(
      evaluateSession(session({ revokedAt: new Date(now.getTime() - 5_000) }), policy, now),
    ).toEqual({ valid: false, reason: 'revoked' });
  });

  it('撤销优先于过期判断', () => {
    expect(
      evaluateSession(
        session({
          revokedAt: new Date(now.getTime() - 5_000),
          expiresAt: new Date(now.getTime() - 1),
        }),
        policy,
        now,
      ),
    ).toEqual({ valid: false, reason: 'revoked' });
  });

  it('到达绝对过期时间即失效', () => {
    expect(evaluateSession(session({ expiresAt: now }), policy, now)).toEqual({
      valid: false,
      reason: 'expired',
    });
    expect(
      evaluateSession(session({ expiresAt: new Date(now.getTime() - 1) }), policy, now),
    ).toEqual({ valid: false, reason: 'expired' });
  });

  it('到达空闲超时边界即失效，边界前仍有效', () => {
    expect(
      evaluateSession(session({ lastUsedAt: new Date(now.getTime() - 60_000) }), policy, now),
    ).toEqual({ valid: false, reason: 'idle_timeout' });
    expect(
      evaluateSession(session({ lastUsedAt: new Date(now.getTime() - 59_999) }), policy, now),
    ).toEqual({ valid: true });
  });

  it('lastUsedAt 略晚于当前时间（时钟漂移）时仍视为可用', () => {
    expect(
      evaluateSession(session({ lastUsedAt: new Date(now.getTime() + 1_000) }), policy, now),
    ).toEqual({ valid: true });
  });
});

describe('computeSessionExpiry', () => {
  it('按绝对有效期从创建时间推算', () => {
    expect(computeSessionExpiry(now, policy).toISOString()).toBe('2026-11-27T13:00:00.000Z');
  });
});

describe('DEFAULT_SESSION_POLICY', () => {
  it('访问令牌短于空闲超时，空闲超时短于绝对有效期', () => {
    expect(DEFAULT_SESSION_POLICY.accessTokenTtlSeconds * 1000).toBeLessThan(
      DEFAULT_SESSION_POLICY.idleTimeoutMs,
    );
    expect(DEFAULT_SESSION_POLICY.idleTimeoutMs).toBeLessThan(
      DEFAULT_SESSION_POLICY.absoluteTimeoutMs,
    );
  });
});
