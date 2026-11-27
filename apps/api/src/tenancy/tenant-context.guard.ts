import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { TenantPermission, TenantRole } from '@starply/contracts';
import {
  evaluateTenantAccess,
  hasTenantPermission,
  isValidTenantSlug,
} from '@starply/tenancy-core';
import type { Request } from 'express';

import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { DatabaseService } from '../database/database.service';
import { Membership, Tenant } from '../database/entities';
import { TENANT_PERMISSION_KEY } from './tenant-permission.decorator';

/** 通过租户校验后写入请求的租户上下文。 */
export interface ResolvedTenantContext {
  id: string;
  slug: string;
  role: TenantRole;
  permissions: readonly TenantPermission[];
}

export interface TenantRequest extends AuthenticatedRequest {
  tenant?: ResolvedTenantContext;
}

/**
 * 租户上下文守卫：必须在 AccessTokenGuard 之后使用。
 * 1. 解析 `/t/:tenantSlug` 并查询租户，未知 slug 返回 404；
 * 2. 查询当前用户的成员关系，复用 tenancy-core 的租户访问判定；
 * 3. 按 `@RequireTenantPermission` 校验角色权限，未标注时要求 survey:read。
 * 判定只依赖成员关系，不信任请求体中的租户标识。
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const claims = request.auth;
    if (!claims) {
      throw new UnauthorizedException({ code: 'unauthorized', message: '缺少访问令牌' });
    }

    const tenantSlug = readTenantSlug(request);
    if (!tenantSlug) {
      throw new NotFoundException({ code: 'tenant_not_found', message: '租户不存在' });
    }

    const dataSource = this.database.getDataSource();
    const tenant = await dataSource.getRepository(Tenant).findOne({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: '租户不存在' });
    }

    const membership = await dataSource.getRepository(Membership).findOne({
      where: { tenantId: tenant.id, userId: claims.sub },
      select: { role: true, status: true },
    });

    const decision = evaluateTenantAccess({
      tenantStatus: tenant.status,
      membership: membership ? { role: membership.role, status: membership.status } : null,
    });

    if (!decision.allowed) {
      throw new ForbiddenException({
        code: decision.reason,
        message: TENANT_DENIAL_MESSAGES[decision.reason],
      });
    }

    const requiredPermission =
      (Reflect.getMetadata(TENANT_PERMISSION_KEY, context.getHandler()) as
        TenantPermission | undefined) ?? 'survey:read';

    if (!hasTenantPermission(decision.role, requiredPermission)) {
      throw new ForbiddenException({
        code: 'permission_denied',
        message: `当前角色缺少 ${requiredPermission} 权限`,
      });
    }

    request.tenant = {
      id: tenant.id,
      slug: tenant.slug,
      role: decision.role,
      permissions: decision.permissions,
    };

    return true;
  }
}

const TENANT_DENIAL_MESSAGES = {
  tenant_inactive: '租户已停用或归档',
  membership_missing: '当前用户不属于该租户',
  membership_inactive: '成员关系未激活，请先接受邀请或联系管理员',
} as const;

function readTenantSlug(request: Request): string | null {
  const params: unknown = request.params;
  if (typeof params !== 'object' || params === null) {
    return null;
  }

  const slug = (params as Record<string, unknown>)['tenantSlug'];
  return isValidTenantSlug(slug) ? slug : null;
}
