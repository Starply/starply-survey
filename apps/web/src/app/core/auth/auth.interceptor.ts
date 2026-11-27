import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '../api/api-config';
import { AuthService } from './auth.service';
import { AuthSessionStore } from './auth-session.store';

/**
 * 鉴权拦截器：
 * - 给发往 API 的请求附加 Bearer 访问令牌；
 * - 访问令牌过期（401）时用刷新令牌换一次新令牌并重放请求；
 * - 刷新失败则清空本地会话并跳转登录页，登录页保留 returnUrl。
 * 登录/刷新/登出本身不做重试，避免递归刷新。
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(AuthSessionStore);
  const auth = inject(AuthService);
  const router = inject(Router);
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');

  if (!request.url.startsWith(baseUrl)) {
    return next(request);
  }

  const token = store.accessToken();
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  const handleExpired = (error: unknown) => {
    store.clear();
    void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });

    return throwError(() => error);
  };

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const isAuthEndpoint = request.url.includes('/auth/');
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      if (!store.refreshToken()) {
        return handleExpired(error);
      }

      return from(auth.refreshOnce()).pipe(
        catchError(() => handleExpired(error)),
        switchMap((tokens) =>
          next(
            request.clone({
              setHeaders: { Authorization: `${tokens.tokenType} ${tokens.accessToken}` },
            }),
          ),
        ),
      );
    }),
  );
};
