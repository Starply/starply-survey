import { InjectionToken } from '@angular/core';

/**
 * API 根地址。
 * 开发环境由 proxy.conf.json 把 /api 转发到本地 API 并去掉前缀；
 * 其他环境通过覆盖该 token 指向实际网关地址。
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
