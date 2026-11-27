import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from './api-config';

/** 请求参数；当前只需要字符串键值，用于筛选与分页预留。 */
export type ApiQuery = Record<string, string | number | boolean>;

/**
 * 轻量 API 客户端：统一拼接根地址并转成 Promise。
 * 鉴权头与 401 刷新由 authInterceptor 负责，业务代码不需要关心令牌。
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');

  get<T>(path: string, query?: ApiQuery): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.resolve(path), { params: query }));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.resolve(path), body));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.resolve(path), body));
  }

  private resolve(path: string): string {
    return path.startsWith('/') ? `${this.baseUrl}${path}` : `${this.baseUrl}/${path}`;
  }
}
