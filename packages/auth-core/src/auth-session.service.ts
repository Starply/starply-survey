/**
 * 登录与会话服务：登录、刷新令牌轮换、登出。
 * 依赖用户查询、密码校验与会话存储三个端口，具体实现（TypeORM / Argon2id / Redis 客户端）
 * 由上层注入，便于在无数据库、无 Redis 的环境中单测。
 */

import { computeSessionExpiry, DEFAULT_SESSION_POLICY, evaluateSession } from './session-policy';
import type { SessionPolicy } from './session-policy';
import { computeSessionTtlMs } from './session-keys';
import type { SessionStore, StoredSession } from './session-store';
import type { SessionId, UserId } from './types';
import {
  createAccessToken,
  createRefreshToken,
  createSessionId,
  hashRefreshSecret,
  isRefreshSecretValid,
  parseRefreshToken,
} from './tokens';

export interface AuthUserCredential {
  id: UserId;
  email: string;
  passwordHash: string;
  /** active / disabled；非 active 一律拒绝登录。 */
  status: string;
}

export interface UserCredentialLookup {
  findByEmail(email: string): Promise<AuthUserCredential | null>;
}

export interface PasswordVerifier {
  verify(passwordHash: string, plainPassword: string): Promise<boolean>;
}

export type LoginFailureReason = 'invalid_credentials' | 'user_disabled';

export type RefreshFailureReason =
  'invalid_refresh_token' | 'refresh_token_reused' | 'session_expired' | 'session_idle_timeout';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** 访问令牌有效期（秒）。 */
  expiresIn: number;
  sessionId: SessionId;
}

export type LoginResult =
  { ok: true; tokens: IssuedTokens } | { ok: false; reason: LoginFailureReason };

export type RefreshResult =
  { ok: true; tokens: IssuedTokens } | { ok: false; reason: RefreshFailureReason };

export interface AuthSessionServiceOptions {
  accessTokenSecret: string;
  policy?: SessionPolicy;
  now?: () => Date;
}

export class AuthSessionService {
  private readonly policy: SessionPolicy;
  private readonly now: () => Date;

  constructor(
    private readonly users: UserCredentialLookup,
    private readonly passwords: PasswordVerifier,
    private readonly sessions: SessionStore,
    private readonly options: AuthSessionServiceOptions,
  ) {
    this.policy = options.policy ?? DEFAULT_SESSION_POLICY;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * 登录：先校验密码再检查账号状态，避免对未注册邮箱与密码错误给出不同提示。
   */
  async login(email: string, password: string): Promise<LoginResult> {
    if (!email || !password) {
      return { ok: false, reason: 'invalid_credentials' };
    }

    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user) {
      return { ok: false, reason: 'invalid_credentials' };
    }

    const passwordMatched = await this.passwords.verify(user.passwordHash, password);
    if (!passwordMatched) {
      return { ok: false, reason: 'invalid_credentials' };
    }

    if (user.status !== 'active') {
      return { ok: false, reason: 'user_disabled' };
    }

    const now = this.now();
    const sessionId = createSessionId();
    const refreshToken = createRefreshToken(sessionId);
    const session = this.buildSession(sessionId, user.id, refreshToken, now);
    await this.sessions.save(session, computeSessionTtlMs(session, this.policy, now));

    return {
      ok: true,
      tokens: this.issueTokens(session.id, user.id, refreshToken, now),
    };
  }

  /**
   * 刷新：校验刷新令牌 secret 哈希后轮换新令牌。
   * 旧令牌再次出现视为重放，直接删除会话（撤销该登录）。
   */
  async refresh(refreshToken: string): Promise<RefreshResult> {
    const parts = parseRefreshToken(refreshToken);
    if (!parts) {
      return { ok: false, reason: 'invalid_refresh_token' };
    }

    const session = await this.sessions.find(parts.sessionId);
    if (!session) {
      return { ok: false, reason: 'invalid_refresh_token' };
    }

    if (!isRefreshSecretValid(parts.secret, session.refreshTokenHash)) {
      await this.sessions.revoke(session.id);
      return { ok: false, reason: 'refresh_token_reused' };
    }

    const now = this.now();
    const evaluation = evaluateSession(session, this.policy, now);
    if (!evaluation.valid) {
      await this.sessions.revoke(session.id);

      return {
        ok: false,
        reason: evaluation.reason === 'expired' ? 'session_expired' : 'session_idle_timeout',
      };
    }

    const nextToken = createRefreshToken(session.id);
    const nextSecret = parseRefreshToken(nextToken)?.secret;
    if (!nextSecret) {
      return { ok: false, reason: 'invalid_refresh_token' };
    }

    const updated: StoredSession = {
      ...session,
      lastUsedAt: now,
      refreshTokenHash: hashRefreshSecret(nextSecret),
    };
    await this.sessions.update(updated, computeSessionTtlMs(updated, this.policy, now));

    return {
      ok: true,
      tokens: this.issueTokens(session.id, session.userId, nextToken, now),
    };
  }

  /** 登出：删除会话；访问令牌在剩余有效期内仍可用，最长一个访问令牌 TTL。 */
  async logout(refreshToken: string): Promise<void> {
    const parts = parseRefreshToken(refreshToken);
    if (!parts) {
      return;
    }

    await this.sessions.revoke(parts.sessionId);
  }

  private buildSession(
    sessionId: SessionId,
    userId: UserId,
    refreshToken: string,
    now: Date,
  ): StoredSession {
    const secret = parseRefreshToken(refreshToken)?.secret ?? '';

    return {
      id: sessionId,
      userId,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: computeSessionExpiry(now, this.policy),
      revokedAt: null,
      refreshTokenHash: hashRefreshSecret(secret),
    };
  }

  private issueTokens(
    sessionId: SessionId,
    userId: UserId,
    refreshToken: string,
    now: Date,
  ): IssuedTokens {
    return {
      accessToken: createAccessToken(
        {
          userId,
          sessionId,
          ttlSeconds: this.policy.accessTokenTtlSeconds,
          now,
        },
        this.options.accessTokenSecret,
      ),
      refreshToken,
      expiresIn: this.policy.accessTokenTtlSeconds,
      sessionId,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
