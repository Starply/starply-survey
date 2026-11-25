export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
}

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  /** 租户未配置语言时的默认语言。 */
  defaultLanguage: string;
  /** 租户未配置时区时的默认时区；数据库时间仍以 UTC 存储。 */
  defaultTimeZone: string;
  database: DatabaseConfig;
  redis: RedisConfig;
}

/**
 * 仅提供配置位：本轮不绑定任何 ORM 或 Redis 客户端。
 * 实际连接在数据层选型确认后再接入。
 */
export default (): AppConfiguration => {
  const env = process.env;

  return {
    nodeEnv: env['NODE_ENV'] ?? 'development',
    port: Number(env['PORT'] ?? 25200),
    defaultLanguage: env['DEFAULT_LANGUAGE'] || 'zh-CN',
    defaultTimeZone: env['DEFAULT_TIME_ZONE'] || 'Asia/Shanghai',
    database: {
      host: env['MYSQL_HOST'] ?? '127.0.0.1',
      port: Number(env['MYSQL_PORT'] ?? 3306),
      user: env['MYSQL_USER'] ?? '',
      password: env['MYSQL_PASSWORD'] ?? '',
      database: env['MYSQL_DATABASE'] ?? '',
    },
    redis: {
      host: env['REDIS_HOST'] ?? '127.0.0.1',
      port: Number(env['REDIS_PORT'] ?? 6379),
      password: env['REDIS_PASSWORD'] ?? '',
    },
  };
};
