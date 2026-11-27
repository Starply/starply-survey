import { describe, expect, it } from 'vitest';

import { evaluateTenantAccess, isMembershipStatus, isTenantStatus } from './access';

describe('isTenantStatus / isMembershipStatus', () => {
  it('识别已知状态', () => {
    expect(isTenantStatus('active')).toBe(true);
    expect(isTenantStatus('suspended')).toBe(true);
    expect(isTenantStatus('archived')).toBe(true);
    expect(isTenantStatus('deleted')).toBe(false);

    expect(isMembershipStatus('invited')).toBe(true);
    expect(isMembershipStatus('active')).toBe(true);
    expect(isMembershipStatus('suspended')).toBe(true);
    expect(isMembershipStatus('removed')).toBe(true);
    expect(isMembershipStatus('pending')).toBe(false);
  });
});

describe('evaluateTenantAccess', () => {
  it('active 租户 + active 成员关系时允许进入并带出权限', () => {
    const decision = evaluateTenantAccess({
      tenantStatus: 'active',
      membership: { role: 'editor', status: 'active' },
    });

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.role).toBe('editor');
      expect(decision.permissions).toContain('survey:publish');
    }
  });

  it('没有成员关系时拒绝', () => {
    expect(evaluateTenantAccess({ tenantStatus: 'active' })).toEqual({
      allowed: false,
      reason: 'membership_missing',
    });
    expect(evaluateTenantAccess({ tenantStatus: 'active', membership: null })).toEqual({
      allowed: false,
      reason: 'membership_missing',
    });
  });

  it('成员状态不是 active 时拒绝', () => {
    for (const status of ['invited', 'suspended', 'removed'] as const) {
      expect(
        evaluateTenantAccess({ tenantStatus: 'active', membership: { role: 'owner', status } }),
      ).toEqual({ allowed: false, reason: 'membership_inactive' });
    }
  });

  it('租户停用或归档时拒绝，即使成员关系仍是 active', () => {
    for (const tenantStatus of ['suspended', 'archived'] as const) {
      expect(
        evaluateTenantAccess({
          tenantStatus,
          membership: { role: 'owner', status: 'active' },
        }),
      ).toEqual({ allowed: false, reason: 'tenant_inactive' });
    }
  });

  it('租户状态优先于成员关系判定', () => {
    expect(evaluateTenantAccess({ tenantStatus: 'suspended' })).toEqual({
      allowed: false,
      reason: 'tenant_inactive',
    });
  });
});
