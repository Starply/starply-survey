import { describe, expect, it } from 'vitest';

import {
  InMemorySessionStore,
  RedisSessionStore,
  type RedisSessionClient,
  type StoredSession,
} from './session-store';

const now = new Date('2026-11-27T12:00:00.000Z');

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    refreshTokenHash: 'hash-1',
    ...overrides,
  };
}

describe('InMemorySessionStore', () => {
  it('保存、读取与更新', async () => {
    const current = now.getTime();
    const store = new InMemorySessionStore(() => current);

    await store.save(session(), 30_000);
    expect(await store.find('session-1')).toMatchObject({
      userId: 'user-1',
      refreshTokenHash: 'hash-1',
    });

    await store.update(session({ refreshTokenHash: 'hash-2' }), 30_000);
    expect((await store.find('session-1'))?.refreshTokenHash).toBe('hash-2');

    await store.revoke('session-1');
    expect(await store.find('session-1')).toBeNull();
  });

  it('到达 TTL 后视为不存在', async () => {
    let current = now.getTime();
    const store = new InMemorySessionStore(() => current);

    await store.save(session(), 5_000);
    current += 5_000;
    expect(await store.find('session-1')).toBeNull();
  });

  it('返回副本，外部修改不影响已存记录', async () => {
    const store = new InMemorySessionStore(() => now.getTime());
    const saved = session();
    await store.save(saved, 30_000);

    saved.refreshTokenHash = 'mutated';

    expect((await store.find('session-1'))?.refreshTokenHash).toBe('hash-1');
  });
});

describe('RedisSessionStore', () => {
  function createClient() {
    const data = new Map<string, string>();
    const calls: { set: [string, string, number][]; del: string[] } = { set: [], del: [] };
    const client: RedisSessionClient = {
      async get(key) {
        return data.get(key) ?? null;
      },
      async set(key, value, ttlSeconds) {
        data.set(key, value);
        calls.set.push([key, value, ttlSeconds]);
      },
      async del(key) {
        data.delete(key);
        calls.del.push(key);
      },
    };

    return { client, data, calls };
  }

  it('以秒级 TTL 写入并带回日期', async () => {
    const { client, calls } = createClient();
    const store = new RedisSessionStore(client);

    await store.save(session(), 30_500);
    expect(calls.set[0]?.[0]).toBe('cache:auth:session:session-1');
    expect(calls.set[0]?.[2]).toBe(31);

    const found = await store.find('session-1');
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.createdAt.toISOString()).toBe(now.toISOString());
    expect(found?.refreshTokenHash).toBe('hash-1');
  });

  it('TTL 小于 1 秒时按 1 秒写入，避免无效过期值', async () => {
    const { client, calls } = createClient();
    await new RedisSessionStore(client).save(session(), 200);
    expect(calls.set[0]?.[2]).toBe(1);
  });

  it('损坏数据视为不存在，撤销时删除键', async () => {
    const { client, data, calls } = createClient();
    const store = new RedisSessionStore(client);

    data.set('cache:auth:session:session-1', 'not-json');
    expect(await store.find('session-1')).toBeNull();

    await store.revoke('session-1');
    expect(calls.del).toEqual(['cache:auth:session:session-1']);
  });
});
