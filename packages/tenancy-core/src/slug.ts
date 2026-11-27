/**
 * 租户 slug 规则。
 * slug 出现在公开地址 /t/{slug} 中，按 DNS label 的子集约束：
 * 只允许小写字母、数字与连字符，3–63 字符，首尾不能是连字符。
 */

export const TENANT_SLUG_MIN_LENGTH = 3;
export const TENANT_SLUG_MAX_LENGTH = 63;

/**
 * 保留 slug：与系统路径或基础设施域名冲突，创建租户时拒绝。
 * 解析既有链接时不使用该名单，避免历史租户因名单更新而无法访问。
 */
export const RESERVED_TENANT_SLUGS = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'health',
  'static',
  'support',
  't',
  'www',
] as const;

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type TenantSlugIssue = 'empty' | 'length' | 'format' | 'reserved';

export type TenantSlugCheckResult =
  { ok: true; slug: string } | { ok: false; issue: TenantSlugIssue };

/** 去掉首尾空白并转小写；不做其他改写（不折叠内部空格或下划线）。 */
export function normalizeTenantSlug(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 校验已规范化的 slug 是否可以出现在路径中。
 * 这里要求调用方传入的已是小写形式：路径不做静默大小写折叠，
 * 以免同一租户出现多个可访问地址。
 */
export function isValidTenantSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= TENANT_SLUG_MIN_LENGTH &&
    value.length <= TENANT_SLUG_MAX_LENGTH &&
    TENANT_SLUG_PATTERN.test(value)
  );
}

export function isReservedTenantSlug(value: string): boolean {
  return (RESERVED_TENANT_SLUGS as readonly string[]).includes(value);
}

/**
 * 创建租户时的 slug 校验：先规范化，再依次检查长度、字符集与保留名单。
 * 返回问题代码而不是文案，具体提示由各端做多语言渲染。
 */
export function checkTenantSlug(value: unknown): TenantSlugCheckResult {
  if (typeof value !== 'string') {
    return { ok: false, issue: 'empty' };
  }

  const slug = normalizeTenantSlug(value);
  if (slug.length === 0) {
    return { ok: false, issue: 'empty' };
  }
  if (slug.length < TENANT_SLUG_MIN_LENGTH || slug.length > TENANT_SLUG_MAX_LENGTH) {
    return { ok: false, issue: 'length' };
  }
  if (!TENANT_SLUG_PATTERN.test(slug)) {
    return { ok: false, issue: 'format' };
  }
  if (isReservedTenantSlug(slug)) {
    return { ok: false, issue: 'reserved' };
  }

  return { ok: true, slug };
}
