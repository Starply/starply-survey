import { join } from 'node:path';

import type { DataSourceOptions } from 'typeorm';

import { ENTITIES } from './entities';

export interface DatabaseConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  poolSize: number;
}

/**
 * 运行时与迁移 CLI 共用的数据源配置。
 * - 字符集/排序规则显式对齐 utf8mb4_0900_ai_ci
 * - mysql2 timezone=Z：Date 与 DATETIME 之间按 UTC 转换（D10）
 * - 禁止 synchronize；迁移由显式命令执行
 */
export function createDataSourceOptions(config: DatabaseConnectionOptions): DataSourceOptions {
  return {
    type: 'mysql',
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z',
    synchronize: false,
    migrationsRun: false,
    // MySQL 的 DDL 会隐式提交；用 each/all 包裹会导致迁移记录与表状态不一致。
    migrationsTransactionMode: 'none',
    logging: false,
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    extra: {
      connectionLimit: config.poolSize,
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 10_000,
      enableKeepAlive: true,
    },
  };
}
