import { inject, Injectable } from '@angular/core';
import type {
  AuthIdentityResponse,
  AuthTokensResponse,
  LoginRequest,
  RefreshTokenRequest,
} from '@starply/contracts';

import { ApiClient } from '../api/api-client';
import { AuthSessionStore } from './auth-session.store';

/**
 * 认证接口封装。
 * 登录/刷新/登出都走无鉴权端点；访问令牌由拦截器附加到业务请求上。
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly store = inject(AuthSessionStore);

  /** 同一时刻只允许一个刷新请求，避免并发 401 反复轮换令牌。 */
  private refreshTask: Promise<AuthTokensResponse> | null = null;

  async login(email: string, password: string): Promise<AuthTokensResponse> {
    const request: LoginRequest = { email, password };
    const tokens = await this.api.post<AuthTokensResponse>('/auth/login', request);
    this.store.save(tokens, email);

    return tokens;
  }

  /** 登出：先清本地会话，再尽力通知服务端撤销会话。 */
  async logout(): Promise<void> {
    const refreshToken = this.store.refreshToken();
    this.store.clear();
    if (!refreshToken) {
      return;
    }

    try {
      const request: RefreshTokenRequest = { refreshToken };
      await this.api.post<void>('/auth/logout', request);
    } catch {
      // 服务端不可达时本地登出已经生效，无需再打扰用户。
    }
  }

  me(): Promise<AuthIdentityResponse> {
    return this.api.get<AuthIdentityResponse>('/auth/me');
  }

  /** 供拦截器复用：并发 401 共享同一个刷新结果。 */
  refreshOnce(): Promise<AuthTokensResponse> {
    this.refreshTask ??= this.refresh().finally(() => {
      this.refreshTask = null;
    });

    return this.refreshTask;
  }

  private async refresh(): Promise<AuthTokensResponse> {
    const refreshToken = this.store.refreshToken();
    if (!refreshToken) {
      throw new Error('缺少刷新令牌');
    }

    const request: RefreshTokenRequest = { refreshToken };
    const tokens = await this.api.post<AuthTokensResponse>('/auth/refresh', request);
    this.store.save(tokens, this.store.email());

    return tokens;
  }
}
