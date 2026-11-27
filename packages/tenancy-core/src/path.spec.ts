import { describe, expect, it } from 'vitest';

import { buildTenantPath, matchTenantPath, TENANT_PATH_PREFIX } from './path';

describe('matchTenantPath', () => {
  it('解析租户根路径', () => {
    expect(matchTenantPath('/t/acme')).toEqual({ tenantSlug: 'acme', rest: '/' });
    expect(matchTenantPath('/t/acme/')).toEqual({ tenantSlug: 'acme', rest: '/' });
  });

  it('解析租户下的子路径', () => {
    expect(matchTenantPath('/t/acme/admin/surveys')).toEqual({
      tenantSlug: 'acme',
      rest: '/admin/surveys',
    });
    expect(matchTenantPath('/t/acme/s/2026')).toEqual({ tenantSlug: 'acme', rest: '/s/2026' });
  });

  it('忽略 query 与 hash', () => {
    expect(matchTenantPath('/t/acme?tab=1')).toEqual({ tenantSlug: 'acme', rest: '/' });
    expect(matchTenantPath('/t/acme/s/1#section')).toEqual({
      tenantSlug: 'acme',
      rest: '/s/1',
    });
  });

  it('前缀缺失或 slug 非法时返回 null', () => {
    expect(matchTenantPath('/t/')).toBeNull();
    expect(matchTenantPath('/t')).toBeNull();
    expect(matchTenantPath('/')).toBeNull();
    expect(matchTenantPath('')).toBeNull();
    expect(matchTenantPath('/x/t/acme')).toBeNull();
    expect(matchTenantPath('/t/ACME')).toBeNull();
    expect(matchTenantPath('/t/ab')).toBeNull();
  });

  it('路径中的 slug 不折叠大小写', () => {
    expect(matchTenantPath('/t/Acme')).toBeNull();
  });
});

describe('buildTenantPath', () => {
  it('拼出租户根路径', () => {
    expect(buildTenantPath('acme')).toBe('/t/acme');
    expect(buildTenantPath('acme', '/')).toBe('/t/acme');
  });

  it('拼接子路径时补齐前导斜杠', () => {
    expect(buildTenantPath('acme', '/admin')).toBe('/t/acme/admin');
    expect(buildTenantPath('acme', 's/1')).toBe('/t/acme/s/1');
  });

  it('与 matchTenantPath 可往返', () => {
    const path = buildTenantPath('acme', '/admin/surveys');
    expect(path.startsWith(TENANT_PATH_PREFIX)).toBe(true);
    expect(matchTenantPath(path)).toEqual({ tenantSlug: 'acme', rest: '/admin/surveys' });
  });

  it('slug 非法时抛错', () => {
    expect(() => buildTenantPath('ACME')).toThrow();
    expect(() => buildTenantPath('ab')).toThrow();
  });
});
