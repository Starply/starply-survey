/**
 * 会话生命周期规则。
 * 服务端会话同时受绝对过期与空闲超时约束：
 * - 绝对过期从创建时固定，轮换不延长（防止会话无限续命）；
 * - 空闲超时随每次使用滑动，长期不活跃需要重新登录；
 * - 撤销优先于任何时间判断。
 */

import type { AuthSessionRecord } from './types';

export interface SessionPolicy {
  /** 访问令牌有效期（秒）。 */
  accessTokenTtlSeconds: number;
  /** 空闲超时（毫秒）：超过该时长未使用即失效。 */
  idleTimeoutMs: number;
  /** 绝对有效期（毫秒）：从会话创建起算。 */
  absoluteTimeoutMs: number;
}

/** 首版默认值：访问令牌 15 分钟、空闲 7 天、绝对 30 天。可按需调整。 */
export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  accessTokenTtlSeconds: 15 * 60,
  idleTimeoutMs: 7 * 24 * 60 * 60 * 1000,
  absoluteTimeoutMs: 30 * 24 * 60 * 60 * 1000,
};

export type SessionInvalidReason = 'revoked' | 'expired' | 'idle_timeout';

export type SessionEvaluation = { valid: true } | { valid: false; reason: SessionInvalidReason };

type SessionTimestamps = Pick<AuthSessionRecord, 'lastUsedAt' | 'expiresAt' | 'revokedAt'>;

/** 计算新会话的绝对过期时间；已存在的会话不应调用本函数延长有效期。 */
export function computeSessionExpiry(createdAt: Date, policy: SessionPolicy): Date {
  return new Date(createdAt.getTime() + policy.absoluteTimeoutMs);
}

/**
 * 判定会话在 now 时刻是否可用。
 * 判定顺序：已撤销 → 绝对过期 → 空闲超时；到达边界的瞬间即视为失效。
 */
export function evaluateSession(
  session: SessionTimestamps,
  policy: SessionPolicy,
  now: Date,
): SessionEvaluation {
  if (session.revokedAt) {
    return { valid: false, reason: 'revoked' };
  }

  const nowMs = now.getTime();
  if (nowMs >= session.expiresAt.getTime()) {
    return { valid: false, reason: 'expired' };
  }

  if (nowMs - session.lastUsedAt.getTime() >= policy.idleTimeoutMs) {
    return { valid: false, reason: 'idle_timeout' };
  }

  return { valid: true };
}
