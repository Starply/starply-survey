export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  poolSize: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
}

export interface AuthConfig {
  /** HS256 访问令牌签名密钥；必须由环境变量提供，缺失时认证模块启动即失败。 */
  accessTokenSecret: string;
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
  auth: AuthConfig;
}

/**
 * 仅提供配置位：ORM 与 Redis 客户端在各自的 Service 中接入。
 * 会话 TTL（15 分钟 / 空闲 7 天 / 绝对 30 天）由 @starply/auth-core 的默认策略固定，不通过环境变量调整。
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
      poolSize: Number(env['MYSQL_POOL_SIZE'] ?? 10),
    },
    redis: {
      host: env['REDIS_HOST'] ?? '127.0.0.1',
      port: Number(env['REDIS_PORT'] ?? 6379),
      password: env['REDIS_PASSWORD'] ?? '',
    },
    auth: {
      accessTokenSecret: env['AUTH_ACCESS_TOKEN_SECRET'] ?? '',
    },
  };
};
