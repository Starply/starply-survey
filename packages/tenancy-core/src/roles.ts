/**
 * 租户内角色与权限矩阵。
 * 角色是租户内的授权单位：一个用户在不同租户可以有不同角色（见 membership）。
 * 权限粒度面向管理端菜单与接口鉴权，新增权限时必须同步更新所有角色的授权表。
 */

export const TENANT_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

export const TENANT_PERMISSIONS = [
  'tenant:read',
  'tenant:update',
  'member:read',
  'member:invite',
  'member:update',
  'member:remove',
  'survey:read',
  'survey:create',
  'survey:update',
  'survey:delete',
  'survey:publish',
  'question_bank:read',
  'question_bank:manage',
  'response:read',
  'response:export',
  'audit:read',
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

/**
 * 角色授权表：
 * - owner 是租户创建者/最高权限，独占 tenant:update；
 * - admin 管理成员、问卷与答卷，但不能修改租户本身；
 * - editor 负责问卷内容与发布，可维护题库并导出答卷；
 * - viewer 只读。
 */
export const ROLE_PERMISSIONS: Readonly<Record<TenantRole, readonly TenantPermission[]>> = {
  owner: TENANT_PERMISSIONS,
  admin: [
    'tenant:read',
    'member:read',
    'member:invite',
    'member:update',
    'member:remove',
    'survey:read',
    'survey:create',
    'survey:update',
    'survey:delete',
    'survey:publish',
    'question_bank:read',
    'question_bank:manage',
    'response:read',
    'response:export',
    'audit:read',
  ],
  editor: [
    'tenant:read',
    'member:read',
    'survey:read',
    'survey:create',
    'survey:update',
    'survey:publish',
    'question_bank:read',
    'question_bank:manage',
    'response:read',
    'response:export',
  ],
  viewer: ['tenant:read', 'member:read', 'survey:read', 'question_bank:read', 'response:read'],
};

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value);
}

export function isTenantPermission(value: unknown): value is TenantPermission {
  return typeof value === 'string' && (TENANT_PERMISSIONS as readonly string[]).includes(value);
}

/** 返回角色拥有的权限集合；返回的是共享只读表，调用方不得修改。 */
export function getTenantPermissions(role: TenantRole): readonly TenantPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasTenantPermission(
  role: TenantRole | null | undefined,
  permission: TenantPermission,
): boolean {
  if (!role) {
    return false;
  }

  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
