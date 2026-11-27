import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { isValidTenantSlug } from '@starply/tenancy-core';

/**
 * 租户路由守卫：slug 出现在地址中，必须符合租户规则。
 * 非法 slug 直接回登录页，避免把不存在的租户当成 404 问卷。
 */
export const tenantSlugGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const tenantSlug = route.paramMap.get('tenantSlug');

  if (tenantSlug && isValidTenantSlug(tenantSlug)) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { reason: 'invalid_tenant' } });
};
