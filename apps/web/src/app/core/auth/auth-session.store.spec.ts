import type { AuthTokensResponse } from '@starply/contracts';

import { AuthSessionStore } from './auth-session.store';

const tokens: AuthTokensResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenType: 'Bearer',
  expiresIn: 900,
};

describe('AuthSessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存令牌后可从同一实例读取', () => {
    const store = new AuthSessionStore();

    store.save(tokens, 'owner@example.com');

    expect(store.isAuthenticated()).toBe(true);
    expect(store.accessToken()).toBe('access-1');
    expect(store.refreshToken()).toBe('refresh-1');
    expect(store.email()).toBe('owner@example.com');
  });

  it('新实例从 localStorage 恢复登录态', () => {
    new AuthSessionStore().save(tokens, 'owner@example.com');

    const restored = new AuthSessionStore();

    expect(restored.accessToken()).toBe('access-1');
    expect(restored.email()).toBe('owner@example.com');
  });

  it('清除后同时移除内存态与持久化数据', () => {
    const store = new AuthSessionStore();
    store.save(tokens, null);

    store.clear();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.accessToken()).toBeNull();
    expect(localStorage.getItem('starply.auth.session')).toBeNull();
    expect(new AuthSessionStore().isAuthenticated()).toBe(false);
  });

  it('忽略损坏的持久化内容', () => {
    localStorage.setItem('starply.auth.session', '{"accessToken": 1}');

    expect(new AuthSessionStore().isAuthenticated()).toBe(false);
  });
});
