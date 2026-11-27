import { HttpErrorResponse } from '@angular/common/http';

/** 归一化后的接口错误：页面只依赖这个结构做提示与分支。 */
export interface NormalizedApiError {
  /** HTTP 状态码；网络异常为 0。 */
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * 常见错误码的中文文案。
 * 服务端已返回中文 message 时优先使用服务端文案，这里只作为兜底与网络层错误的补充。
 */
const FALLBACK_MESSAGES: Record<string, string> = {
  network_error: '无法连接服务，请确认 API 已启动',
  http_error: '请求失败，请稍后重试',
  unknown_error: '发生未知错误',
  invalid_request: '请求参数不合法',
  invalid_credentials: '邮箱或密码不正确',
  user_disabled: '账号已停用，请联系租户管理员',
  invalid_refresh_token: '登录已失效，请重新登录',
  session_expired: '会话已过期，请重新登录',
  session_idle_timeout: '长时间未操作，请重新登录',
  unauthorized: '请先登录',
  token_expired: '登录已过期，请重新登录',
  permission_denied: '当前角色没有该操作权限',
  tenant_not_found: '租户不存在或已被移除',
  tenant_inactive: '租户已停用',
  membership_missing: '你不在该租户的成员列表中',
  membership_inactive: '你在这个租户的成员身份已停用',
  questionnaire_not_found: '问卷不存在或已被删除',
  questionnaire_slug_taken: '该租户下已存在相同标识的问卷',
  invalid_slug: '标识只允许小写字母、数字与连字符，长度 3-63',
  survey_invalid: '问卷内容未通过校验，请先修正',
  draft_missing: '问卷缺少可发布的草稿',
  database_unavailable: '数据库暂不可用，请稍后重试',
  session_store_unavailable: '会话存储暂不可用，请稍后重试',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把 HttpClient 抛出的错误转成带业务错误码的结构。 */
export function normalizeApiError(error: unknown): NormalizedApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { status: 0, code: 'network_error', message: FALLBACK_MESSAGES['network_error']! };
    }

    const body = error.error;
    if (isRecord(body) && typeof body['code'] === 'string') {
      return {
        status: error.status,
        code: body['code'],
        message: typeof body['message'] === 'string' ? body['message'] : '',
        details: body['details'],
      };
    }

    return {
      status: error.status,
      code: 'http_error',
      message: `请求失败（HTTP ${error.status}）`,
    };
  }

  if (error instanceof Error) {
    return { status: 0, code: 'unknown_error', message: error.message };
  }

  return { status: 0, code: 'unknown_error', message: FALLBACK_MESSAGES['unknown_error']! };
}

/** 页面展示用的错误文案。 */
export function describeApiError(error: unknown): string {
  const normalized = normalizeApiError(error);
  if (normalized.message.trim().length > 0) {
    return normalized.message;
  }

  return FALLBACK_MESSAGES[normalized.code] ?? FALLBACK_MESSAGES['http_error']!;
}

/** 是否为“需要重新登录”的错误，用于决定是否跳登录页。 */
export function isAuthExpiredError(error: unknown): boolean {
  const { status, code } = normalizeApiError(error);

  return status === 401 || code === 'token_expired' || code === 'unauthorized';
}
