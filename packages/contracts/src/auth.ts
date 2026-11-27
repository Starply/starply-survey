/**
 * 认证相关的跨端类型出口。
 * 认证方案为“服务端会话 + 短期访问令牌”，领域规则实现位于 @starply/auth-core；
 * 前端与 API 都从这里引用会话、令牌声明与接口出入参，避免两端字段漂移。
 */

import type { SessionId, UserId } from '@starply/auth-core';

export type {
  AccessTokenClaims,
  AuthSessionRecord,
  SessionEvaluation,
  SessionId,
  SessionInvalidReason,
  SessionPolicy,
  UserId,
} from '@starply/auth-core';

/** 登录请求体。 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** 刷新令牌与登出共用的请求体。 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** 访问令牌的携带方式：`Authorization: Bearer {accessToken}`。 */
export type AuthTokenType = 'Bearer';

/** 登录与刷新共用的令牌响应；`expiresIn` 为访问令牌有效期（秒）。 */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: AuthTokenType;
  expiresIn: number;
}

/** 携带访问令牌换取的身份信息；租户上下文不在其中，由 `/t/{slug}` 路由与成员校验确定。 */
export interface AuthIdentityResponse {
  userId: UserId;
  sessionId: SessionId;
  /** 访问令牌过期时间（ISO 8601）。 */
  expiresAt: string;
}

/** 认证接口的错误码，前端据此决定提示文案与是否跳转登录。 */
export type AuthErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'user_disabled'
  | 'invalid_refresh_token'
  | 'refresh_token_reused'
  | 'session_expired'
  | 'session_idle_timeout'
  | 'unauthorized'
  | 'token_expired'
  | 'database_unavailable'
  | 'session_store_unavailable';
