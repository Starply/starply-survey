import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse, HealthStatus } from '@starply/contracts';
import type { Response } from 'express';

import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {}

  /** liveness：只表示进程可用，不依赖数据库。 */
  @Get()
  check(): HealthResponse {
    return this.buildResponse('ok');
  }

  @Get('live')
  live(): HealthResponse {
    return this.buildResponse('ok');
  }

  /** readiness：数据库不可用时返回 503，响应体仍带具体检查项。 */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const database = await this.database.checkHealth();
    if (database.status === 'down') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      ...this.buildResponse(database.status === 'up' ? 'ok' : 'error'),
      checks: { database },
    };
  }

  private buildResponse(status: HealthStatus): HealthResponse {
    return {
      status,
      service: 'starply-api',
      version: '0.0.0',
      env: this.config.get<string>('nodeEnv') ?? 'unknown',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
