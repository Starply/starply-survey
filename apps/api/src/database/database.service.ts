import 'reflect-metadata';

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import type { DatabaseConfig } from '../config/configuration';
import { createDataSourceOptions } from './data-source-options';

export interface DatabaseHealth {
  status: 'up' | 'down';
  latencyMs: number;
  code?: string;
}

function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return 'DB_UNAVAILABLE';
}

/**
 * 自己管理 DataSource 生命周期：
 * - 启动不阻塞：库暂时不可用时 API 仍能启动，readiness 返回 503；
 * - 后台按固定间隔重连；
 * - 关闭时释放连接池。
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly databaseConfig: DatabaseConfig;
  private readonly retryDelayMs = 5_000;

  private dataSource: DataSource | null = null;
  private connecting = false;
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(config: ConfigService) {
    this.databaseConfig = config.getOrThrow<DatabaseConfig>('database');
  }

  onModuleInit(): void {
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const dataSource = this.dataSource;
    this.dataSource = null;
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  }

  /** 供后续业务模块取用；未连接时抛错，避免悄悄拿到不可用连接。 */
  getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) {
      throw new Error('Database is not connected');
    }
    return this.dataSource;
  }

  async checkHealth(): Promise<DatabaseHealth> {
    const startedAt = Date.now();
    if (!this.dataSource?.isInitialized) {
      return { status: 'down', latencyMs: 0, code: 'NOT_CONNECTED' };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { status: 'down', latencyMs: Date.now() - startedAt, code: readErrorCode(error) };
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || this.dataSource?.isInitialized) {
      return;
    }

    this.connecting = true;
    const dataSource = new DataSource(createDataSourceOptions(this.databaseConfig));

    try {
      await dataSource.initialize();
      if (this.stopped) {
        await dataSource.destroy();
        return;
      }
      this.dataSource = dataSource;
      this.logger.log('Database connected');
    } catch (error) {
      await dataSource.destroy().catch(() => undefined);
      this.logger.warn(
        `Database connection failed (${readErrorCode(error)}); retrying in ${this.retryDelayMs}ms`,
      );
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) {
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, this.retryDelayMs);
    this.retryTimer.unref();
  }
}
