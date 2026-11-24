import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@starply/contracts';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'starply-api',
      version: '0.0.0',
      env: this.config.get<string>('nodeEnv') ?? 'unknown',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
