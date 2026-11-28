export interface DevelopmentAccount {
  tenantSlug: string;
  tenantName: string;
  email: string;
  password: string;
  displayName: string;
}

/**
 * 本地联调默认账号：前端登录页直接带出，后端 seed 脚本据此建号。
 * 两边共用这一份值，避免测试凭据漂移。
 *
 * 安全约束：
 * - 前端只在 `environment.ts`（开发构建）引用；生产构建通过 fileReplacements
 *   换成 `environment.production.ts`，不会把这些值打进生产包。
 * - 后端生产环境（NODE_ENV=production）不读取这里的默认值，必须显式配置
 *   DEFAULT_ACCOUNT_* 环境变量。
 */
export const DEVELOPMENT_ACCOUNT: DevelopmentAccount = {
  tenantSlug: 'acme',
  tenantName: 'Acme 演示租户',
  email: 'demo@starply.dev',
  password: 'Starply@2026',
  displayName: '演示管理员',
};
