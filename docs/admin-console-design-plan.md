# 用户管理、租户管理与个人中心设计与实施计划

> 状态：设计稿（2026-11-28）。本轮只输出设计，不实现这三个模块。
> 相关文档：[技术可行性评估](technical-feasibility-assessment.md)。

## 1. 现状排查结论

### 1.1 已有设计与基础设施

仓库里没有这三个模块的完整设计，但底层模型、权限矩阵和方向性规划已经存在：

| 已有内容 | 位置 | 说明 |
| --- | --- | --- |
| 租户 / 用户 / 成员 / 邀请实体 | `apps/api/src/database/entities/` | `tenant`、`user`、`membership`、`invitation` 已建表 |
| 租户内角色与权限 | `packages/tenancy-core/src/roles.ts` | `owner/admin/editor/viewer`；含 `member:read/invite/update/remove`、`tenant:read/update`、`audit:read` |
| 租户访问判定 | `packages/tenancy-core/src/access.ts` | 租户状态 + 成员状态统一判定，拒绝原因使用错误码 |
| 租户上下文守卫 | `apps/api/src/tenancy/tenant-context.guard.ts` | 按 `/t/{slug}` + membership 服务端鉴权，`@RequireTenantPermission` 标注权限 |
| 认证与会话 | `packages/auth-core/`、`apps/api/src/auth/` | 登录/刷新/登出/`GET /auth/me`；服务端会话存 Redis，访问令牌携带 `sub`、`sid` |
| 模块划分建议 | 技术评估 6.2 | 建议拆出 `tenants/`（租户、成员、邀请、角色）与 `users/`（全局用户身份） |
| 数据模型要点 | 技术评估 7.3 | 租户为第一等实体；一个用户可属于多个租户；邀请记录过期时间 |
| 租户开通方式 | 技术评估 Q14 | **B：人工开通 + 邮件邀请成员**，后续再评估自助注册 |

### 1.2 缺口

- 没有成员列表、邀请、角色变更、移除成员的 API 和页面。
- 没有邀请接受与“通过邀请注册”的流程；README 仍标注“注册与邀请激活未落地”。
- 没有租户设置接口，也没有“我的租户”列表，前端无法做租户切换。
- 前端目前不知道当前用户在租户内的角色/权限，只能靠接口返回 403 来提示。
- 没有个人中心：资料修改、改密、登录会话管理均缺失；`GET /auth/me` 只返回 `userId/sessionId/expiresAt`。
- `audit:read` 已声明但审计日志未落地，本轮不展开。

**结论**：有可复用的租户模型、角色权限与邀请表，但没有面向用户的完整方案。下面按现有模型补齐设计。

---

## 2. 设计原则

1. **复用现有模型**：优先使用 `membership`、`invitation`、`user`、`tenant`，不为三个模块新增核心表。
2. **服务端权威**：角色与权限只由 `TenantContextGuard` 和服务层判定，前端菜单/按钮仅作体验优化。
3. **租户隔离**：所有成员与租户设置接口都挂在 `/t/{slug}` 下，查询与更新同时带 `tenant_id`。
4. **软删除与可追溯**：移除成员写 `membership.status='removed'`，不做物理删除；邀请撤销写 `revokedAt`。
5. **最小可用**：先做成员/邀请与租户设置，再把邀请邮件、会话管理逐层补上。

---

## 3. 公共基础：当前租户权限视图

三个模块的菜单和按钮都依赖“我在这个租户里能做什么”，建议先补一个接口：

```http
GET /t/{slug}/me
```

响应：

```ts
interface TenantSelfResponse {
  userId: string;
  email: string;
  displayName: string;
  role: TenantRole;
  permissions: TenantPermission[];
  membershipStatus: MembershipStatus;
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: TenantStatus;
    defaultLanguage: string;
    defaultTimeZone: string;
  };
}
```

- 权限：登录 + 有效成员关系（当前 `TenantContextGuard` 已覆盖）。
- 前端据此渲染菜单、按钮禁用态；真正的写权限仍由接口校验。
- 该接口是三个模块的前置依赖，应先于页面实现。

---

## 4. 用户管理（租户成员与邀请）

### 4.1 定位

“用户管理”指**当前租户内的成员与待接受邀请**，不是平台级全局用户管理。全局用户身份只由个人中心维护。

### 4.2 数据模型

复用现有表，MVP 不需要新表：

- `membership(tenant_id, user_id, role, status)`，唯一约束 `(tenant_id, user_id)`。
- `invitation(tenant_id, email, role, invited_by, token_hash, expires_at, accepted_at, revoked_at)`。
- `user(email, password_hash, display_name, status)`，邮箱全局唯一。

建议补充的索引/约束（迁移）：

- `membership(tenant_id, status)`：成员列表按状态筛选。
- `invitation(tenant_id, email)` 已有；待处理邀请按 `tenant_id + accepted_at IS NULL + revoked_at IS NULL` 查询。
- 邀请 token 只保存 SHA-256，明文只在生成时返回一次。

### 4.3 权限与业务边界

| 操作 | owner | admin | editor | viewer |
| --- | --- | --- | --- | --- |
| 查看成员/邀请 | ✅ | ✅ | ✅（`member:read`） | ✅（`member:read`） |
| 邀请成员 | ✅ | ✅ | ❌ | ❌ |
| 修改角色/状态 | ✅ | ✅（不能动 owner/admin） | ❌ | ❌ |
| 移除成员 | ✅ | ✅（不能动 owner/admin） | ❌ | ❌ |
| 转让所有权 | ✅（后续） | ❌ | ❌ | ❌ |

硬性规则：

1. 租户必须至少保留一个 `owner`：不能移除/降级最后一个 owner。
2. `admin` 不能修改或移除 `owner`，也不能把成员提升为 `owner`。
3. 不能修改自己的角色（避免误操作导致失去管理权）；退出租户另行设计。
4. 移除成员是软删除：`membership.status='removed'`；重新邀请时复用该记录并重置为 `invited`。
5. 邀请状态由时间字段推导：已接受 / 已撤销 / 已过期 / 待处理。
6. 邀请有效期 7 天；同一租户同一邮箱只允许一条待处理邀请。

### 4.4 API 设计

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `GET /t/{slug}/members` | `member:read` | 成员列表：用户 id、邮箱、姓名、角色、状态、加入时间 |
| `GET /t/{slug}/invitations?status=pending` | `member:read` | 待处理邀请列表 |
| `POST /t/{slug}/invitations` | `member:invite` | 创建邀请 `{ email, role }`，返回一次性邀请链接/token |
| `POST /t/{slug}/invitations/{id}/revoke` | `member:update` | 撤销邀请，写 `revokedAt` |
| `PATCH /t/{slug}/members/{userId}` | `member:update` | 修改 `{ role?, status? }` |
| `DELETE /t/{slug}/members/{userId}` | `member:remove` | 软删除成员 |

邀请接受（无需租户上下文，属于认证/用户域）：

| 接口 | 说明 |
| --- | --- |
| `GET /invitations/{token}` | 校验 token，返回租户名称、邮箱、角色、过期时间（公开预览） |
| `POST /invitations/{token}/accept` | 已登录用户接受；token 邮箱必须与当前账号邮箱一致 |
| `POST /invitations/{token}/register` | 新用户通过邀请注册：`{ displayName, password }`，创建 user + membership 并建立会话 |

- MVP 可先只做“已登录用户接受”，把“新用户注册”放到第二阶段。
- 邮件发送尚未接入：第一版可返回邀请链接，由管理员复制发送；后续再接邮件服务。

### 4.5 Web 页面

- 路由：`/t/{slug}/members`，菜单名「用户管理」。
- 成员表格：姓名 / 邮箱 / 角色 / 状态 / 加入时间 / 操作。
- 邀请弹窗：邮箱 + 角色（owner/admin/editor/viewer，按操作者权限过滤）。
- 操作：修改角色、停用/恢复、移除（二次确认）。
- 待处理邀请单独一块，支持撤销与复制邀请链接。
- 所有角色可进入页面（`member:read`），写按钮按权限隐藏或禁用。

### 4.6 错误码

`member_not_found`、`member_email_taken`、`invitation_not_found`、`invitation_expired`、`invitation_revoked`、`invitation_email_mismatch`、`invitation_exists`、`last_owner_required`、`cannot_manage_owner`、`cannot_change_own_role`。

---

## 5. 租户管理

### 5.1 定位

“租户管理”指**当前租户的设置与租户切换**，不是平台级租户开通/删除。租户创建仍按 Q14 由人工/CLI 完成。

### 5.2 数据与权限

- 读：`tenant:read`（所有角色）。
- 写：`tenant:update`（仅 owner）。
- 可编辑：`name`、`defaultLanguage`、`defaultTimeZone`。
- 不可编辑：`slug`（公开填写地址已使用）、`status`（平台运维操作）。
- 品牌配置（Logo、主题色）作为后续扩展，不进入首版。

### 5.3 API 设计

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `GET /t/{slug}` | `tenant:read` | 当前租户设置 |
| `PATCH /t/{slug}` | `tenant:update` | 修改 `{ name?, defaultLanguage?, defaultTimeZone? }` |
| `GET /me/tenants` | 登录 | 当前用户可进入的租户列表（含角色、状态），用于切换器 |

`GET /me/tenants` 与个人中心共用，返回：

```ts
interface MyTenantSummary {
  id: string;
  slug: string;
  name: string;
  role: TenantRole;
  membershipStatus: MembershipStatus;
}
```

### 5.4 Web 页面

- 路由：`/t/{slug}/settings`，菜单名「租户设置」。
- 所有角色可查看；非 owner 时表单只读并提示“仅 owner 可修改”。
- 顶部账号区增加租户切换器，数据来自 `GET /me/tenants`。
- 当前租户 slug 展示为只读字段，避免破坏公开链接。

---

## 6. 个人中心

### 6.1 定位

个人中心是**用户级**能力，与租户无关；可以在任何租户外壳下进入，接口不依赖 `/t/{slug}`。

### 6.2 数据与会话

- 资料直接读写 `user` 表：`email`、`displayName`、`status`。
- 邮箱作为登录标识，首版不允许自助修改；改邮箱后续走验证流程。
- 会话记录在 Redis（`AuthSessionRecord` 含 `createdAt/lastUsedAt/expiresAt`），目前没有“按用户列出会话”的索引，需要补：
  - 新增 `cache:auth:user-sessions:{userId}` 集合，保存 sessionId；
  - 登录时写入、登出/撤销/过期时清理；
  - 会话列表只返回 `sessionId/createdAt/lastUsedAt/expiresAt/current`。

### 6.3 API 设计

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `GET /me` | 登录 | 个人资料：`userId/email/displayName/status` |
| `PATCH /me` | 登录 | 修改 `{ displayName }` |
| `POST /me/password` | 登录 | `{ currentPassword, newPassword }`；校验旧密码，更新 Argon2id 哈希，撤销其他会话 |
| `GET /me/sessions` | 登录 | 当前账号的会话列表 |
| `DELETE /me/sessions/{sessionId}` | 登录 | 撤销指定会话（不能撤销当前会话，或撤销后需重新登录） |
| `DELETE /me/sessions` | 登录 | 撤销除当前会话外的全部会话 |
| `GET /me/tenants` | 登录 | 我的租户列表，供切换器与个人中心展示 |

`GET /auth/me` 保留为令牌自省接口；个人资料使用新的 `/me`，避免改变现有语义。

### 6.4 Web 页面

- 路由：`/t/{slug}/profile`，沿用租户外壳，菜单名「个人中心」。
- 资料卡：邮箱（只读）、显示名称（可编辑）。
- 安全设置：修改密码（当前密码 + 新密码 + 确认）。
- 登录会话：当前会话与其他会话列表，支持“退出其他设备”。
- 账号区菜单：个人中心 / 退出登录。

---

## 7. 菜单与权限矩阵（目标态）

| 菜单 | 路由 | 可见性 | 可写角色 |
| --- | --- | --- | --- |
| 问卷管理 | `/t/{slug}/questionnaires` | 全部（`survey:read`） | owner/admin/editor |
| 题库 | `/t/{slug}/question-bank` | 全部（`question_bank:read`） | owner/admin/editor |
| 用户管理 | `/t/{slug}/members` | 全部（`member:read`） | owner/admin |
| 租户设置 | `/t/{slug}/settings` | 全部（`tenant:read`） | owner |
| 个人中心 | `/t/{slug}/profile` | 全部 | 本人 |

顶部菜单在现有「问卷管理 / 题库」基础上追加三项；用户管理与租户设置对 viewer 只读展示，个人中心始终可用。

---

## 8. 分阶段实施计划

| 阶段 | 内容 | 关键文件 |
| --- | --- | --- |
| Phase 0 | 契约 + `GET /t/{slug}/me` + 前端按权限渲染菜单 | `packages/contracts`、`apps/api/src/tenancy`、`tenant-shell` |
| Phase 1 | 成员列表、邀请、撤销、角色/状态变更、移除 | 新增 `apps/api/src/members/`、Web `features/members/` |
| Phase 2 | 邀请接受 + 通过邀请注册（打通 Q14 B） | `auth` + `members`、公开邀请页 |
| Phase 3 | 租户设置、我的租户、租户切换 | `apps/api/src/tenants/`、Web `features/tenant-settings/` |
| Phase 4 | 个人中心资料、改密、会话管理 | `apps/api/src/users/`、auth-core 会话索引、Web `features/profile/` |

每个阶段要求：

- 服务层核心规则补单测（尤其是 owner 保护、跨租户隔离、邀请状态流转）。
- 新接口补契约类型，避免前后端字段漂移。
- 全量 `build / test / typecheck / lint / format:check` 通过。
- 更新 README 的接口表与“尚未解决的点”。

---

## 9. 本轮范围与后续待确认

本轮只完成：

- 管理端内容区自适应布局调整（撑满屏幕、顶部菜单固定）。
- 本文档中的三个模块设计。

本轮不实现成员/租户/个人中心代码。待确认问题：

1. `admin` 是否可以邀请/管理其他 `admin`？建议默认不可以，保持 owner 独占高级管理。
2. 是否允许成员主动退出租户？建议后续提供“退出租户”，但最后一个 owner 不允许退出。
3. 个人中心路由使用 `/t/{slug}/profile`（共享外壳）还是全局 `/me`？当前建议前者。
4. 邀请邮件服务选型与发送时机（当前先返回链接手动发送）。
5. 个人中心会话列表需要 Redis 用户会话索引，是否在 Phase 4 一并落地。
6. 审计日志（`audit:read`）是否进入下一个里程碑。
