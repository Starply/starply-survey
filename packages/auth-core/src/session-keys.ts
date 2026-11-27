/**
 * Redis 会话键与 TTL 计算。
 * 会话与队列/缓存实例分离部署，键统一带 `cache:` 前缀便于观测与按前缀失效。
 */

import type { SessionPolicy } from './session-policy';
import type { AuthSessionRecord } from './types';

export const SESSION_KEY_PREFIX = 'cache:auth:session:';

export function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

/**
 * 会话键的 TTL：绝对剩余时间与空闲剩余时间取较小值。
 * 已过期或已空闲超时返回 0，调用方应删除键而不是以 0 TTL 写入。
 */
export function computeSessionTtlMs(
  session: Pick<AuthSessionRecord, 'lastUsedAt' | 'expiresAt'>,
  policy: SessionPolicy,
  now: Date,
): number {
  const nowMs = now.getTime();
  const absoluteRemainingMs = session.expiresAt.getTime() - nowMs;
  const idleRemainingMs = policy.idleTimeoutMs - (nowMs - session.lastUsedAt.getTime());

  return Math.max(0, Math.min(absoluteRemainingMs, idleRemainingMs));
}
