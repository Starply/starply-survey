import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import configuration from './configuration';

const CONFIG_KEYS = [
  'NODE_ENV',
  'PORT',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
];

describe('configuration', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of CONFIG_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of CONFIG_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it('uses development defaults', () => {
    const config = configuration();

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(25200);
    expect(config.database.host).toBe('127.0.0.1');
    expect(config.database.port).toBe(3306);
    expect(config.redis.port).toBe(6379);
  });

  it('reads overrides from env', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '4000';
    process.env['MYSQL_HOST'] = 'db.local';
    process.env['REDIS_PORT'] = '6380';

    const config = configuration();

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(4000);
    expect(config.database.host).toBe('db.local');
    expect(config.redis.port).toBe(6380);
  });
});
