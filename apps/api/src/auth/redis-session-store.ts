import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import {
  RedisSessionStore,
  type RedisSessionClient,
  type SessionStore,
  type StoredSession,
} from '@starply/auth-core';

import type { RedisConfig } from '../config/configuration';

/** Redis 连接失败或超时；由控制器映射为 503，而不是暴露成 500。 */
export class SessionStoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super('会话存储不可用', { cause });
    this.name = 'SessionStoreUnavailableError';
  }
}

/** 把 ioredis 适配成 auth-core 需要的三个方法；会话 TTL 以秒写入。 */
export class IoredisSessionClient implements RedisSessionClient {
  constructor(private readonly client: Pick<Redis, 'get' | 'set' | 'del'>) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Redis 不接受 0 TTL，向上取整到 1 秒避免 SET 失败。
    await this.client.set(key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

/**
 * 生产用会话存储：连接由应用管理的 Redis（D9：缓存/队列分实例）。
 * - `enableOfflineQueue: false` + `maxRetriesPerRequest: 1`：Redis 不可用时登录/刷新快速失败，
 *   不会把请求挂在离线队列里等待；
 * - 连接断开后 ioredis 按默认退避策略在后台重连，无需重启 API。
 */
@Injectable()
export class AuthRedisSessionStore implements SessionStore, OnModuleDestroy {
  private readonly logger = new Logger(AuthRedisSessionStore.name);
  private readonly redis: Redis;
  private readonly store: RedisSessionStore;

  constructor(config: ConfigService) {
    const redisConfig = config.getOrThrow<RedisConfig>('redis');
    const redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
    });

    this.redis = redis;
    this.store = new RedisSessionStore(new IoredisSessionClient(redis));

    // ioredis 的 error 事件无人监听会抛出进程级异常，这里统一降级为日志。
    redis.on('error', (error: Error) => {
      this.logger.warn(`Redis 会话存储连接异常：${error.message}`);
    });
  }

  save(session: StoredSession, ttlMs: number): Promise<void> {
    return this.guard(() => this.store.save(session, ttlMs));
  }

  find(sessionId: string): Promise<StoredSession | null> {
    return this.guard(() => this.store.find(sessionId));
  }

  update(session: StoredSession, ttlMs: number): Promise<void> {
    return this.guard(() => this.store.update(session, ttlMs));
  }

  revoke(sessionId: string): Promise<void> {
    return this.guard(() => this.store.revoke(sessionId));
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private async guard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw new SessionStoreUnavailableError(error);
    }
  }
}
