import { SetMetadata } from '@nestjs/common';
import type { TenantPermission } from '@starply/contracts';

export const TENANT_PERMISSION_KEY = 'starply:tenant-permission';

/**
 * 声明访问该路由需要的最小租户权限。
 * 未声明时按 least privilege 退化为 survey:read，避免新路由忘记标注。
 */
export function RequireTenantPermission(permission: TenantPermission): MethodDecorator {
  return SetMetadata(TENANT_PERMISSION_KEY, permission);
}
