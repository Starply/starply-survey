import 'reflect-metadata';

import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';

import { createDataSourceOptions } from './data-source-options';
import { Tenant } from './entities/tenant.entity';

const config = {
  host: '127.0.0.1',
  port: 3306,
  user: 'test',
  password: 'test',
  database: 'starply',
  poolSize: 7,
};

describe('createDataSourceOptions', () => {
  it('显式配置字符集、UTC 时区、连接池与迁移行为', () => {
    const options = createDataSourceOptions(config);
    const extra = options.extra as { connectionLimit: number };

    expect(options.type).toBe('mysql');
    expect(options.charset).toBe('utf8mb4_0900_ai_ci');
    expect(options.timezone).toBe('Z');
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.migrationsTransactionMode).toBe('none');
    expect(extra.connectionLimit).toBe(7);
  });

  it('实体与列使用 snake_case', () => {
    const table = getMetadataArgsStorage().tables.find((item) => item.target === Tenant);
    const columns = getMetadataArgsStorage()
      .columns.filter((item) => item.target === Tenant)
      .map((item) => item.options.name ?? item.propertyName);

    expect(table?.name).toBe('tenant');
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'slug',
        'name',
        'default_language',
        'default_timezone',
        'created_at',
        'updated_at',
      ]),
    );
  });
});
