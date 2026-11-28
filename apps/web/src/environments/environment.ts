import { DEVELOPMENT_ACCOUNT } from '@starply/dev-fixtures';

/** 登录页开发默认账号；生产构建会被 environment.production.ts 替换。 */
export interface DefaultAccountEnvironment {
  tenantSlug: string;
  email: string;
  password: string;
}

export const environment: {
  production: boolean;
  defaultAccount: DefaultAccountEnvironment | null;
} = {
  production: false,
  defaultAccount: {
    tenantSlug: DEVELOPMENT_ACCOUNT.tenantSlug,
    email: DEVELOPMENT_ACCOUNT.email,
    password: DEVELOPMENT_ACCOUNT.password,
  },
};
