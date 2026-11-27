/**
 * 租户路径解析：公开填写页与管理端统一使用 /t/{tenantSlug}/... 作为租户前缀。
 * 解析只做字符串规则判断，不查询数据库；租户是否存在由上层仓储决定。
 */

import { isValidTenantSlug } from './slug';

export const TENANT_PATH_PREFIX = '/t/';

export interface TenantPathMatch {
  tenantSlug: string;
  /** 租户前缀之后的剩余路径，始终以 / 开头；没有子路径时为 /。 */
  rest: string;
}

/**
 * 从 pathname 中解析租户 slug；不匹配或 slug 非法时返回 null。
 * 会忽略 query 与 hash，便于直接传入浏览器地址。
 */
export function matchTenantPath(pathname: string): TenantPathMatch | null {
  if (typeof pathname !== 'string') {
    return null;
  }

  const path = stripQueryAndHash(pathname);
  if (!path.startsWith(TENANT_PATH_PREFIX)) {
    return null;
  }

  const remainder = path.slice(TENANT_PATH_PREFIX.length);
  if (remainder.length === 0) {
    return null;
  }

  const separatorIndex = remainder.indexOf('/');
  const tenantSlug = separatorIndex === -1 ? remainder : remainder.slice(0, separatorIndex);
  if (!isValidTenantSlug(tenantSlug)) {
    return null;
  }

  const tail = separatorIndex === -1 ? '' : remainder.slice(separatorIndex);

  return {
    tenantSlug,
    rest: tail.length === 0 || tail === '/' ? '/' : tail,
  };
}

/** 拼接租户路径；slug 非法时抛错，避免生成不可访问的链接。 */
export function buildTenantPath(tenantSlug: string, rest = '/'): string {
  if (!isValidTenantSlug(tenantSlug)) {
    throw new Error(`Invalid tenant slug: ${tenantSlug}`);
  }

  if (rest.length === 0 || rest === '/') {
    return `${TENANT_PATH_PREFIX}${tenantSlug}`;
  }

  return `${TENANT_PATH_PREFIX}${tenantSlug}${rest.startsWith('/') ? rest : `/${rest}`}`;
}

function stripQueryAndHash(pathname: string): string {
  const hashIndex = pathname.indexOf('#');
  const withoutHash = hashIndex === -1 ? pathname : pathname.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');

  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
}
