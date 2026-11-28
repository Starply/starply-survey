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

/**
 * 默认账号：本地演示数据（pnpm db:seed:demo）使用的租户与管理员。
 * 集中在一处配置，seed 脚本与后续初始化流程共用；生产环境必须通过环境变量覆盖。
 */
export interface DefaultAccountConfig {
  tenantSlug: string;
  tenantName: string;
  email: string;
  password: string;
  displayName: string;
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
  defaultAccount: DefaultAccountConfig;
}

/**
 * 开发环境默认账号；未设置任何环境变量时本地可直接登录。
 * 优先级：DEFAULT_ACCOUNT_* > 旧版 DEMO_* > 内置开发默认值。
 */
export const DEVELOPMENT_DEFAULT_ACCOUNT = {
  tenantSlug: 'acme',
  email: 'demo@starply.dev',
  password: 'Starply@2026',
  displayName: '演示管理员',
} as const;

export function readDefaultAccountConfig(
  env: NodeJS.ProcessEnv = process.env,
): DefaultAccountConfig {
  const fallback = DEVELOPMENT_DEFAULT_ACCOUNT;
  const tenantSlug =
    env['DEFAULT_ACCOUNT_TENANT_SLUG']?.trim() ||
    env['DEMO_TENANT_SLUG']?.trim() ||
    fallback.tenantSlug;

  return {
    tenantSlug,
    tenantName:
      env['DEFAULT_ACCOUNT_TENANT_NAME']?.trim() ||
      env['DEMO_TENANT_NAME']?.trim() ||
      `${tenantSlug} 演示租户`,
    email: env['DEFAULT_ACCOUNT_EMAIL']?.trim() || env['DEMO_EMAIL']?.trim() || fallback.email,
    password: env['DEFAULT_ACCOUNT_PASSWORD'] || env['DEMO_PASSWORD'] || fallback.password,
    displayName:
      env['DEFAULT_ACCOUNT_DISPLAY_NAME']?.trim() ||
      env['DEMO_DISPLAY_NAME']?.trim() ||
      fallback.displayName,
  };
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
    defaultAccount: readDefaultAccountConfig(env),
  };
};
