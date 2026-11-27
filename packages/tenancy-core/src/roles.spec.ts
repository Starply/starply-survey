import { describe, expect, it } from 'vitest';

import {
  getTenantPermissions,
  hasTenantPermission,
  isTenantPermission,
  isTenantRole,
  ROLE_PERMISSIONS,
  TENANT_PERMISSIONS,
  TENANT_ROLES,
} from './roles';

describe('isTenantRole', () => {
  it('识别已知角色', () => {
    for (const role of TENANT_ROLES) {
      expect(isTenantRole(role)).toBe(true);
    }
  });

  it('拒绝未知角色', () => {
    expect(isTenantRole('guest')).toBe(false);
    expect(isTenantRole('')).toBe(false);
    expect(isTenantRole(null)).toBe(false);
    expect(isTenantRole(undefined)).toBe(false);
  });
});

describe('权限矩阵', () => {
  it('每个角色只引用已声明的权限', () => {
    for (const role of TENANT_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(isTenantPermission(permission)).toBe(true);
      }
    }
  });

  it('owner 拥有全部权限', () => {
    expect([...ROLE_PERMISSIONS.owner]).toEqual([...TENANT_PERMISSIONS]);
  });

  it('只有 owner 可以修改租户本身', () => {
    expect(hasTenantPermission('owner', 'tenant:update')).toBe(true);
    expect(hasTenantPermission('admin', 'tenant:update')).toBe(false);
    expect(hasTenantPermission('editor', 'tenant:update')).toBe(false);
    expect(hasTenantPermission('viewer', 'tenant:update')).toBe(false);
  });

  it('admin 可以管理成员与删除问卷', () => {
    expect(hasTenantPermission('admin', 'member:invite')).toBe(true);
    expect(hasTenantPermission('admin', 'member:remove')).toBe(true);
    expect(hasTenantPermission('admin', 'survey:delete')).toBe(true);
    expect(hasTenantPermission('admin', 'audit:read')).toBe(true);
  });

  it('editor 可以编辑与发布问卷，但不能管理成员或删除问卷', () => {
    expect(hasTenantPermission('editor', 'survey:create')).toBe(true);
    expect(hasTenantPermission('editor', 'survey:update')).toBe(true);
    expect(hasTenantPermission('editor', 'survey:publish')).toBe(true);
    expect(hasTenantPermission('editor', 'response:export')).toBe(true);
    expect(hasTenantPermission('editor', 'survey:delete')).toBe(false);
    expect(hasTenantPermission('editor', 'member:invite')).toBe(false);
  });

  it('viewer 只读', () => {
    expect(getTenantPermissions('viewer')).toEqual([
      'tenant:read',
      'member:read',
      'survey:read',
      'response:read',
    ]);
    expect(hasTenantPermission('viewer', 'survey:read')).toBe(true);
    expect(hasTenantPermission('viewer', 'response:export')).toBe(false);
    expect(hasTenantPermission('viewer', 'survey:create')).toBe(false);
    expect(hasTenantPermission('viewer', 'survey:publish')).toBe(false);
  });

  it('缺少角色时一律无权限', () => {
    expect(hasTenantPermission(null, 'survey:read')).toBe(false);
    expect(hasTenantPermission(undefined, 'survey:read')).toBe(false);
  });
});
