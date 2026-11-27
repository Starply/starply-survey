import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { isValidTenantSlug } from '@starply/tenancy-core';

import { AuthSessionStore } from './auth-session.store';

/**
 * 管理端路由守卫：没有本地令牌时跳转登录。
 * 租户登录页在 /t/{slug}/login，未带租户时退回全局 /login。
 */
export const authGuard: CanActivateFn = (route) => {
  const store = inject(AuthSessionStore);
  const router = inject(Router);

  if (store.isAuthenticated()) {
    return true;
  }

  const tenantSlug = route.paramMap.get('tenantSlug');
  const loginPath =
    tenantSlug && isValidTenantSlug(tenantSlug) ? ['/t', tenantSlug, 'login'] : ['/login'];

  return router.createUrlTree(loginPath, { queryParams: { returnUrl: router.url } });
};
