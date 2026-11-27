import 'reflect-metadata';

import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../config/configuration';
import { DatabaseService } from './database.service';

const databaseConfig: DatabaseConfig = {
  host: '127.0.0.1',
  port: 3306,
  user: 'test',
  password: 'test',
  database: 'starply',
  poolSize: 10,
};

const config = {
  getOrThrow: vi.fn(() => databaseConfig),
} as unknown as ConfigService;

describe('DatabaseService', () => {
  it('未连接时 readiness 为 down', async () => {
    const service = new DatabaseService(config);

    await expect(service.checkHealth()).resolves.toEqual({
      status: 'down',
      latencyMs: 0,
      code: 'NOT_CONNECTED',
    });
  });

  it('连接可用时执行 SELECT 1 并返回 up', async () => {
    const service = new DatabaseService(config);
    const query = vi.fn().mockResolvedValue([{ '1': 1 }]);
    (service as unknown as { dataSource: unknown }).dataSource = {
      isInitialized: true,
      query,
    };

    const result = await service.checkHealth();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('查询失败时返回错误码', async () => {
    const service = new DatabaseService(config);
    (service as unknown as { dataSource: unknown }).dataSource = {
      isInitialized: true,
      query: vi.fn().mockRejectedValue({ code: 'ECONNREFUSED' }),
    };

    await expect(service.checkHealth()).resolves.toMatchObject({
      status: 'down',
      code: 'ECONNREFUSED',
    });
  });

  it('未连接时 getDataSource 抛 503', () => {
    const service = new DatabaseService(config);
    let error: unknown;

    try {
      service.getDataSource();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const exception = error as ServiceUnavailableException;
    expect(exception.getStatus()).toBe(503);
    expect(exception.getResponse()).toMatchObject({ code: 'database_unavailable' });
  });

  it('销毁时释放连接池', async () => {
    const service = new DatabaseService(config);
    const destroy = vi.fn().mockResolvedValue(undefined);
    (service as unknown as { dataSource: unknown }).dataSource = {
      isInitialized: true,
      destroy,
    };

    await service.onModuleDestroy();

    expect(destroy).toHaveBeenCalledOnce();
  });
});
