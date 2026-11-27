import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { MembershipStatus, TenantRole, TenantStatus } from '@starply/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { Membership, Tenant } from '../database/entities';
import { RequireTenantPermission } from './tenant-permission.decorator';
import { TenantContextGuard, type TenantRequest } from './tenant-context.guard';

interface FakeTenant {
  id: string;
  slug: string;
  status: TenantStatus;
}

interface FakeMembership {
  role: TenantRole;
  status: MembershipStatus;
}

class SurveyHandlers {
  @RequireTenantPermission('survey:publish')
  publish(): void {}

  @RequireTenantPermission('survey:read')
  read(): void {}

  /** 未声明权限的路由按 survey:read 处理。 */
  undocumented(): void {}
}

const activeTenant: FakeTenant = { id: 'tenant-1', slug: 'acme', status: 'active' };

function createGuard(options: { tenant?: FakeTenant | null; membership?: FakeMembership | null }): {
  guard: TenantContextGuard;
  membershipFindOne: ReturnType<typeof vi.fn>;
} {
  const tenantFindOne = vi.fn(async () => options.tenant ?? null);
  const membershipFindOne = vi.fn(async () => options.membership ?? null);
  const getRepository = (entity: unknown): unknown => {
    if (entity === Tenant) {
      return { findOne: tenantFindOne };
    }
    if (entity === Membership) {
      return { findOne: membershipFindOne };
    }

    throw new Error('未预期的实体查询');
  };
  const database = {
    getDataSource: () => ({ getRepository }),
  } as unknown as DatabaseService;

  return { guard: new TenantContextGuard(database), membershipFindOne };
}

function createContext(request: Partial<TenantRequest>, handler: () => void): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => SurveyHandlers,
  } as unknown as ExecutionContext;
}

function createRequest(tenantSlug = 'acme'): TenantRequest {
  return {
    auth: { sub: 'user-1', sid: 'session-1', iat: 1_795_000_000, exp: 1_795_000_900 },
    params: { tenantSlug },
  } as unknown as TenantRequest;
}

async function capture<T>(action: () => Promise<unknown>): Promise<T> {
  return action().then(
    () => {
      throw new Error('预期抛出异常');
    },
    (error: unknown) => error as T,
  );
}

const publishHandler = SurveyHandlers.prototype.publish;
const readHandler = SurveyHandlers.prototype.read;
const undocumentedHandler = SurveyHandlers.prototype.undocumented;

describe('TenantContextGuard', () => {
  it('缺少访问令牌声明返回 401', async () => {
    const { guard } = createGuard({ tenant: activeTenant });
    const request = { params: { tenantSlug: 'acme' } } as unknown as TenantRequest;

    const error = await capture<UnauthorizedException>(() =>
      guard.canActivate(createContext(request, readHandler)),
    );

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'unauthorized' });
  });

  it('slug 非法或缺失返回 404 tenant_not_found', async () => {
    const { guard } = createGuard({ tenant: activeTenant });

    await expect(
      capture<NotFoundException>(() =>
        guard.canActivate(createContext(createRequest('ab'), readHandler)),
      ),
    ).resolves.toMatchObject({ response: { code: 'tenant_not_found' } });
  });

  it('租户不存在返回 404', async () => {
    const { guard } = createGuard({ tenant: null });

    await expect(
      capture<NotFoundException>(() =>
        guard.canActivate(createContext(createRequest(), readHandler)),
      ),
    ).resolves.toMatchObject({ response: { code: 'tenant_not_found' } });
  });

  it('租户停用时即使成员有效也返回 403 tenant_inactive', async () => {
    const { guard } = createGuard({
      tenant: { ...activeTenant, status: 'suspended' },
      membership: { role: 'owner', status: 'active' },
    });

    await expect(
      capture<ForbiddenException>(() =>
        guard.canActivate(createContext(createRequest(), readHandler)),
      ),
    ).resolves.toMatchObject({ response: { code: 'tenant_inactive' } });
  });

  it('没有成员关系返回 403 membership_missing', async () => {
    const { guard } = createGuard({ tenant: activeTenant, membership: null });

    await expect(
      capture<ForbiddenException>(() =>
        guard.canActivate(createContext(createRequest(), readHandler)),
      ),
    ).resolves.toMatchObject({ response: { code: 'membership_missing' } });
  });

  it('成员关系未激活返回 403 membership_inactive', async () => {
    const { guard } = createGuard({
      tenant: activeTenant,
      membership: { role: 'editor', status: 'invited' },
    });

    await expect(
      capture<ForbiddenException>(() =>
        guard.canActivate(createContext(createRequest(), readHandler)),
      ),
    ).resolves.toMatchObject({ response: { code: 'membership_inactive' } });
  });

  it('viewer 发布问卷返回 403 permission_denied', async () => {
    const { guard, membershipFindOne } = createGuard({
      tenant: activeTenant,
      membership: { role: 'viewer', status: 'active' },
    });
    const request = createRequest();

    await expect(
      capture<ForbiddenException>(() => guard.canActivate(createContext(request, publishHandler))),
    ).resolves.toMatchObject({ response: { code: 'permission_denied' } });
    expect(membershipFindOne).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: 'user-1' },
      select: { role: true, status: true },
    });
  });

  it('editor 发布问卷通过并写入租户上下文', async () => {
    const { guard } = createGuard({
      tenant: activeTenant,
      membership: { role: 'editor', status: 'active' },
    });
    const request = createRequest();

    await expect(guard.canActivate(createContext(request, publishHandler))).resolves.toBe(true);

    expect(request.tenant).toMatchObject({ id: 'tenant-1', slug: 'acme', role: 'editor' });
    expect(request.tenant?.permissions).toContain('survey:publish');
  });

  it('未声明权限的路由按 survey:read 放行 viewer', async () => {
    const { guard } = createGuard({
      tenant: activeTenant,
      membership: { role: 'viewer', status: 'active' },
    });

    await expect(
      guard.canActivate(createContext(createRequest(), undocumentedHandler)),
    ).resolves.toBe(true);
  });
});
