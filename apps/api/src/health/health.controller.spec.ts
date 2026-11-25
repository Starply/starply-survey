import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';

const config = {
  get: vi.fn((key: string) => (key === 'nodeEnv' ? 'test' : undefined)),
} as unknown as ConfigService;

const database = {
  checkHealth: vi.fn(),
} as unknown as DatabaseService;

const response = {
  status: vi.fn(),
} as unknown as Response;

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new HealthController(config, database);
  });

  it('liveness 不依赖数据库', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('starply-api');
    expect(result.env).toBe('test');
    expect(database.checkHealth).not.toHaveBeenCalled();
  });

  it('数据库正常时 readiness 返回 200 与检查项', async () => {
    vi.mocked(database.checkHealth).mockResolvedValue({ status: 'up', latencyMs: 3 });

    const result = await controller.ready(response);

    expect(response.status).not.toHaveBeenCalled();
    expect(result.status).toBe('ok');
    expect(result.checks?.database).toEqual({ status: 'up', latencyMs: 3 });
  });

  it('数据库异常时 readiness 返回 503 而不是 500', async () => {
    vi.mocked(database.checkHealth).mockResolvedValue({
      status: 'down',
      latencyMs: 5,
      code: 'ECONNREFUSED',
    });

    const result = await controller.ready(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result.status).toBe('error');
    expect(result.checks?.database.status).toBe('down');
    expect(result.checks?.database.code).toBe('ECONNREFUSED');
  });
});
