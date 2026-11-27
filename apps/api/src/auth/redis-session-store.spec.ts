import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { IoredisSessionClient } from './redis-session-store';

interface FakeRedis {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
}

function createClient(): { redis: FakeRedis; client: IoredisSessionClient } {
  const redis: FakeRedis = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  };

  return {
    redis,
    client: new IoredisSessionClient(redis as unknown as Pick<Redis, 'get' | 'set' | 'del'>),
  };
}

describe('IoredisSessionClient', () => {
  it('get 返回字符串或 null', async () => {
    const { redis, client } = createClient();

    await expect(client.get('cache:auth:session:1')).resolves.toBeNull();
    expect(redis.get).toHaveBeenCalledWith('cache:auth:session:1');

    redis.get.mockResolvedValueOnce('{"id":"1"}');
    await expect(client.get('cache:auth:session:1')).resolves.toBe('{"id":"1"}');
  });

  it('set 使用 EX 秒级 TTL，并向上取整到至少 1 秒', async () => {
    const { redis, client } = createClient();

    await client.set('cache:auth:session:1', '{"id":"1"}', 900);
    expect(redis.set).toHaveBeenCalledWith('cache:auth:session:1', '{"id":"1"}', 'EX', 900);

    await client.set('cache:auth:session:2', '{}', 1.2);
    expect(redis.set).toHaveBeenLastCalledWith('cache:auth:session:2', '{}', 'EX', 2);

    await client.set('cache:auth:session:3', '{}', 0);
    expect(redis.set).toHaveBeenLastCalledWith('cache:auth:session:3', '{}', 'EX', 1);
  });

  it('del 删除会话键', async () => {
    const { redis, client } = createClient();

    await client.del('cache:auth:session:1');

    expect(redis.del).toHaveBeenCalledWith('cache:auth:session:1');
  });
});
