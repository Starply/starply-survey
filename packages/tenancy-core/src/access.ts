/**
 * 租户状态与成员状态，以及“当前主体能否进入该租户”的纯判定。
 * 判定结果返回原因代码而非文案，由各端按当前语言渲染。
 */

import type { TenantPermission, TenantRole } from './roles';
import { getTenantPermissions } from './roles';

export const TENANT_STATUSES = ['active', 'suspended', 'archived'] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'removed'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** 某个用户在某租户内的成员关系摘要（不含租户与用户详情）。 */
export interface TenantMembershipRef {
  role: TenantRole;
  status: MembershipStatus;
}

export type TenantAccessDenialReason =
  'tenant_inactive' | 'membership_missing' | 'membership_inactive';

export type TenantAccessDecision =
  | { allowed: true; role: TenantRole; permissions: readonly TenantPermission[] }
  | { allowed: false; reason: TenantAccessDenialReason };

export interface TenantAccessInput {
  tenantStatus: TenantStatus;
  /** 未登录或不了解成员关系时传 null/undefined。 */
  membership?: TenantMembershipRef | null;
}

export function isTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === 'string' && (TENANT_STATUSES as readonly string[]).includes(value);
}

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === 'string' && (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

/**
 * 进入租户管理端的判定顺序：
 * 1. 租户非 active（停用/归档）一律拒绝，即使成员关系仍为 active；
 * 2. 没有成员关系拒绝（含匿名与“用户存在但未加入该租户”）；
 * 3. 成员状态不是 active 拒绝（invited 需先接受邀请，suspended/removed 同样拒绝）。
 */
export function evaluateTenantAccess(input: TenantAccessInput): TenantAccessDecision {
  if (input.tenantStatus !== 'active') {
    return { allowed: false, reason: 'tenant_inactive' };
  }

  const membership = input.membership;
  if (!membership) {
    return { allowed: false, reason: 'membership_missing' };
  }

  if (membership.status !== 'active') {
    return { allowed: false, reason: 'membership_inactive' };
  }

  return {
    allowed: true,
    role: membership.role,
    permissions: getTenantPermissions(membership.role),
  };
}
