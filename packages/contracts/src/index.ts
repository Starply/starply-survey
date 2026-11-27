export * from './questionnaire';
export * from './tenancy';
export * from './auth';

/**
 * 健康检查响应契约。
 * 前端与运维脚本可复用该类型，避免字段命名漂移。
 */
export type HealthStatus = 'ok' | 'error';

export interface HealthCheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  code?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  version: string;
  env: string;
  uptime: number;
  timestamp: string;
  checks?: Record<string, HealthCheckResult>;
}

/**
 * 统一的 API 错误响应契约。
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
