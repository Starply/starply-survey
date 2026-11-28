import { DEVELOPMENT_ACCOUNT } from '@starply/dev-fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import configuration, { readDefaultAccountConfig } from './configuration';

const CONFIG_KEYS = [
  'NODE_ENV',
  'PORT',
  'DEFAULT_LANGUAGE',
  'DEFAULT_TIME_ZONE',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'MYSQL_POOL_SIZE',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'AUTH_ACCESS_TOKEN_SECRET',
  'DEFAULT_ACCOUNT_TENANT_SLUG',
  'DEFAULT_ACCOUNT_TENANT_NAME',
  'DEFAULT_ACCOUNT_EMAIL',
  'DEFAULT_ACCOUNT_PASSWORD',
  'DEFAULT_ACCOUNT_DISPLAY_NAME',
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
    expect(config.defaultLanguage).toBe('zh-CN');
    expect(config.defaultTimeZone).toBe('Asia/Shanghai');
    expect(config.database.host).toBe('127.0.0.1');
    expect(config.database.port).toBe(3306);
    expect(config.database.poolSize).toBe(10);
    expect(config.redis.port).toBe(6379);
    expect(config.auth.accessTokenSecret).toBe('');
    expect(config.defaultAccount).toMatchObject(DEVELOPMENT_ACCOUNT);
  });

  it('reads overrides from env', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '4000';
    process.env['DEFAULT_LANGUAGE'] = 'en';
    process.env['DEFAULT_TIME_ZONE'] = 'UTC';
    process.env['MYSQL_HOST'] = 'db.local';
    process.env['REDIS_PORT'] = '6380';
    process.env['AUTH_ACCESS_TOKEN_SECRET'] = 'secret-from-env';

    const config = configuration();

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(4000);
    expect(config.defaultLanguage).toBe('en');
    expect(config.defaultTimeZone).toBe('UTC');
    expect(config.database.host).toBe('db.local');
    expect(config.redis.port).toBe(6380);
    expect(config.auth.accessTokenSecret).toBe('secret-from-env');
  });
});

describe('readDefaultAccountConfig', () => {
  it('未配置环境变量时返回开发默认账号', () => {
    const account = readDefaultAccountConfig({});

    expect(account).toMatchObject(DEVELOPMENT_ACCOUNT);
    expect(account.tenantName).toBe(DEVELOPMENT_ACCOUNT.tenantName);
  });

  it('生产环境不提供内置测试账号', () => {
    const account = readDefaultAccountConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);

    expect(account).toEqual({
      tenantSlug: '',
      tenantName: '',
      email: '',
      password: '',
      displayName: '',
    });
  });

  it('DEFAULT_ACCOUNT_* 优先于旧版 DEMO_* 与默认值', () => {
    const account = readDefaultAccountConfig({
      DEFAULT_ACCOUNT_TENANT_SLUG: 'survey-lab',
      DEFAULT_ACCOUNT_EMAIL: 'admin@example.com',
      DEFAULT_ACCOUNT_PASSWORD: 'secret-1',
      DEFAULT_ACCOUNT_TENANT_NAME: '调研实验室',
      DEFAULT_ACCOUNT_DISPLAY_NAME: '实验室管理员',
      DEMO_EMAIL: 'legacy@example.com',
      DEMO_PASSWORD: 'legacy-secret',
    } as NodeJS.ProcessEnv);

    expect(account).toEqual({
      tenantSlug: 'survey-lab',
      tenantName: '调研实验室',
      email: 'admin@example.com',
      password: 'secret-1',
      displayName: '实验室管理员',
    });
  });

  it('兼容只看 DEMO_* 的旧环境变量', () => {
    const account = readDefaultAccountConfig({
      DEMO_TENANT_SLUG: 'legacy-tenant',
      DEMO_EMAIL: 'legacy@example.com',
      DEMO_PASSWORD: 'legacy-secret',
      DEMO_TENANT_NAME: '旧租户',
      DEMO_DISPLAY_NAME: '旧管理员',
    } as NodeJS.ProcessEnv);

    expect(account).toEqual({
      tenantSlug: 'legacy-tenant',
      tenantName: '旧租户',
      email: 'legacy@example.com',
      password: 'legacy-secret',
      displayName: '旧管理员',
    });
  });
});
