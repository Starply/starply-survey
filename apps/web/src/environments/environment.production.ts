/** 登录页开发默认账号；生产环境不内置任何测试凭据。 */
export interface DefaultAccountEnvironment {
  tenantSlug: string;
  email: string;
  password: string;
}

export const environment: {
  production: boolean;
  defaultAccount: DefaultAccountEnvironment | null;
} = {
  production: true,
  defaultAccount: null,
};
