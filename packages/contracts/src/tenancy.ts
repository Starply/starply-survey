/**
 * 租户与租户内授权的跨端类型出口。
 * 领域规则实现位于 @starply/tenancy-core；前端路由与 API 鉴权都从这里引用类型，
 * 避免两端各自声明角色、状态与判定结果。
 */
export type {
  MembershipStatus,
  TenantAccessDecision,
  TenantAccessDenialReason,
  TenantAccessInput,
  TenantMembershipRef,
  TenantPermission,
  TenantRole,
  TenantSlugCheckResult,
  TenantSlugIssue,
  TenantStatus,
  TenantPathMatch,
} from '@starply/tenancy-core';
