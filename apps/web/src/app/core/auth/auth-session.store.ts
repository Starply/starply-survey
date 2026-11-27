import { computed, Injectable, signal } from '@angular/core';
import type { AuthTokensResponse, AuthTokenType } from '@starply/contracts';

const STORAGE_KEY = 'starply.auth.session';

/** 本地持久化的登录态；令牌只保存在浏览器，服务端会话才是权威。 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  tokenType: AuthTokenType;
  /** 访问令牌有效期（秒），用于界面提示。 */
  expiresIn: number;
  /** 登录邮箱，仅用于界面展示。 */
  email: string | null;
  /** 令牌获取时间（毫秒）。 */
  acquiredAt: number;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredSession).accessToken === 'string' &&
      typeof (parsed as StoredSession).refreshToken === 'string'
    ) {
      return parsed as StoredSession;
    }
  } catch {
    // 读取失败（隐私模式、内容损坏）时视为未登录。
  }

  return null;
}

/**
 * 登录态存储：signal 驱动界面，localStorage 负责刷新页面后恢复。
 * 不自动续期，访问令牌过期由 authInterceptor 触发刷新或跳登录。
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly state = signal<StoredSession | null>(readStoredSession());

  readonly session = this.state.asReadonly();
  readonly accessToken = computed(() => this.state()?.accessToken ?? null);
  readonly refreshToken = computed(() => this.state()?.refreshToken ?? null);
  readonly email = computed(() => this.state()?.email ?? null);
  readonly isAuthenticated = computed(() => this.state() !== null);

  save(tokens: AuthTokensResponse, email: string | null): void {
    const session: StoredSession = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      email,
      acquiredAt: Date.now(),
    };
    this.write(session);
  }

  clear(): void {
    this.write(null);
  }

  private write(session: StoredSession | null): void {
    this.state.set(session);
    try {
      if (session) {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        globalThis.localStorage?.removeItem(STORAGE_KEY);
      }
    } catch {
      // 存储不可用时仍保留内存态，刷新页面后需要重新登录。
    }
  }
}
