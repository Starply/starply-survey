/**
 * 服务端会话存储端口与两种实现：
 * - RedisSessionStore：生产用，客户端由调用方注入（不绑定具体 Redis 库）；
 * - InMemorySessionStore：单元测试与无 Redis 的本地调试。
 */

import { sessionKey } from './session-keys';
import type { AuthSessionRecord } from './types';

/** 服务端会话记录：在会话时间戳之外保存刷新令牌 secret 的哈希。 */
export interface StoredSession extends AuthSessionRecord {
  refreshTokenHash: string;
}

export interface SessionStore {
  save(session: StoredSession, ttlMs: number): Promise<void>;
  find(sessionId: string): Promise<StoredSession | null>;
  /** 轮换刷新令牌或刷新 lastUsedAt 后整体覆盖，并重算 TTL。 */
  update(session: StoredSession, ttlMs: number): Promise<void>;
  /** 主动登出或检测到令牌重放时删除会话。 */
  revoke(sessionId: string): Promise<void>;
}

/** Redis 客户端最小接口；实际客户端按需适配这几个方法即可。 */
export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export class RedisSessionStore implements SessionStore {
  constructor(private readonly client: RedisSessionClient) {}

  async save(session: StoredSession, ttlMs: number): Promise<void> {
    await this.client.set(sessionKey(session.id), serializeSession(session), toTtlSeconds(ttlMs));
  }

  async find(sessionId: string): Promise<StoredSession | null> {
    const raw = await this.client.get(sessionKey(sessionId));

    return raw ? deserializeSession(raw) : null;
  }

  async update(session: StoredSession, ttlMs: number): Promise<void> {
    await this.save(session, ttlMs);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.client.del(sessionKey(sessionId));
  }
}

/** 仅用于测试与本地调试；TTL 依赖注入的时钟，便于固定时间断言。 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { session: StoredSession; expiresAtMs: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async save(session: StoredSession, ttlMs: number): Promise<void> {
    this.sessions.set(session.id, {
      session: cloneSession(session),
      expiresAtMs: this.now() + ttlMs,
    });
  }

  async find(sessionId: string): Promise<StoredSession | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return null;
    }

    if (entry.expiresAtMs <= this.now()) {
      this.sessions.delete(sessionId);
      return null;
    }

    return cloneSession(entry.session);
  }

  async update(session: StoredSession, ttlMs: number): Promise<void> {
    await this.save(session, ttlMs);
  }

  async revoke(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

function toTtlSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

function serializeSession(session: StoredSession): string {
  return JSON.stringify({
    ...session,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt ? session.revokedAt.toISOString() : null,
  });
}

function deserializeSession(raw: string): StoredSession | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const { id, userId, refreshTokenHash } = parsed;
    if (
      typeof id !== 'string' ||
      typeof userId !== 'string' ||
      typeof refreshTokenHash !== 'string'
    ) {
      return null;
    }

    const createdAt = new Date(String(parsed['createdAt']));
    const lastUsedAt = new Date(String(parsed['lastUsedAt']));
    const expiresAt = new Date(String(parsed['expiresAt']));
    if (
      Number.isNaN(createdAt.getTime()) ||
      Number.isNaN(lastUsedAt.getTime()) ||
      Number.isNaN(expiresAt.getTime())
    ) {
      return null;
    }

    return {
      id,
      userId,
      refreshTokenHash,
      createdAt,
      lastUsedAt,
      expiresAt,
      revokedAt: parsed['revokedAt'] ? new Date(String(parsed['revokedAt'])) : null,
    };
  } catch {
    return null;
  }
}

function cloneSession(session: StoredSession): StoredSession {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    lastUsedAt: new Date(session.lastUsedAt),
    expiresAt: new Date(session.expiresAt),
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
  };
}
