import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { createDataSourceOptions } from './data-source-options';

function readEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function createAppDataSource(): DataSource {
  return new DataSource(
    createDataSourceOptions({
      host: readEnv('MYSQL_HOST', '127.0.0.1'),
      port: Number(readEnv('MYSQL_PORT', '3306')),
      user: readEnv('MYSQL_USER', ''),
      password: readEnv('MYSQL_PASSWORD', ''),
      database: readEnv('MYSQL_DATABASE', ''),
      poolSize: Number(readEnv('MYSQL_POOL_SIZE', '10')),
    }),
  );
}

/** TypeORM CLI 的入口；运行时由 DatabaseService 自行创建 DataSource。 */
export default createAppDataSource();
