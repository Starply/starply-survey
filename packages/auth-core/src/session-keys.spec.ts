import { describe, expect, it } from 'vitest';

import { computeSessionTtlMs, sessionKey, SESSION_KEY_PREFIX } from './session-keys';
import type { SessionPolicy } from './session-policy';

const policy: SessionPolicy = {
  accessTokenTtlSeconds: 900,
  idleTimeoutMs: 60_000,
  absoluteTimeoutMs: 3_600_000,
};

const now = new Date('2026-11-27T12:00:00.000Z');

describe('sessionKey', () => {
  it('使用统一前缀，便于按前缀观测与失效', () => {
    expect(sessionKey('abc')).toBe(`${SESSION_KEY_PREFIX}abc`);
    expect(SESSION_KEY_PREFIX).toBe('cache:auth:session:');
  });
});

describe('computeSessionTtlMs', () => {
  it('绝对剩余时间更小时取绝对剩余', () => {
    expect(
      computeSessionTtlMs(
        { lastUsedAt: now, expiresAt: new Date(now.getTime() + 10_000) },
        policy,
        now,
      ),
    ).toBe(10_000);
  });

  it('空闲剩余时间更小时取空闲剩余', () => {
    expect(
      computeSessionTtlMs(
        {
          lastUsedAt: new Date(now.getTime() - 50_000),
          expiresAt: new Date(now.getTime() + 3_600_000),
        },
        policy,
        now,
      ),
    ).toBe(10_000);
  });

  it('已过期或已空闲超时返回 0', () => {
    expect(computeSessionTtlMs({ lastUsedAt: now, expiresAt: now }, policy, now)).toBe(0);
    expect(
      computeSessionTtlMs(
        {
          lastUsedAt: new Date(now.getTime() - 120_000),
          expiresAt: new Date(now.getTime() + 1_000),
        },
        policy,
        now,
      ),
    ).toBe(0);
  });
});
