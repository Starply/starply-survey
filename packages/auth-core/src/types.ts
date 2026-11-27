/**
 * 认证领域类型：用户/会话标识、服务端会话记录与短期访问令牌声明。
 * 认证方案为“服务端会话 + 短期访问令牌”：访问令牌只携带身份与会话标识，
 * 撤销与续期以服务端会话为准。
 */

export type UserId = string;
export type SessionId = string;

/**
 * 服务端保存的会话记录。
 * 绝对过期时间在创建时固定，后续轮换只刷新 lastUsedAt，不延长 expiresAt。
 */
export interface AuthSessionRecord {
  id: SessionId;
  userId: UserId;
  createdAt: Date;
  lastUsedAt: Date;
  /** 绝对过期时间，轮换不延长。 */
  expiresAt: Date;
  /** 主动登出或检测到令牌重放时写入；非空即视为已撤销。 */
  revokedAt?: Date | null;
}

/**
 * 短期访问令牌的声明。
 * 不携带 tenantId：一个用户可属于多个租户，租户上下文由请求路由与成员校验确定。
 */
export interface AccessTokenClaims {
  /** 用户 id。 */
  sub: UserId;
  /** 会话 id，用于审计与主动登出。 */
  sid: SessionId;
  /** 签发时间，Unix 秒。 */
  iat: number;
  /** 过期时间，Unix 秒。 */
  exp: number;
}
