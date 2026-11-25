export * from './questionnaire';

/**
 * 健康检查响应契约。
 * 前端与运维脚本可复用该类型，避免字段命名漂移。
 */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  env: string;
  uptime: number;
  timestamp: string;
}

/**
 * 统一的 API 错误响应契约。
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
