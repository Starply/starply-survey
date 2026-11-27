import { Module } from '@nestjs/common';

import { TenantContextGuard } from './tenant-context.guard';

/** 租户路径上下文：解析 `/t/:tenantSlug` 并校验成员关系与角色权限。 */
@Module({
  providers: [TenantContextGuard],
  exports: [TenantContextGuard],
})
export class TenancyModule {}
