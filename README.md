# starply-survey

开源的现代 Web 端问卷系统。目标是使用 Angular + NestJS 构建多租户、中英双语的问卷平台，前后端同仓，使用 pnpm 组织。

当前仓库已具备可用的端到端链路：多租户登录、顶栏式管理端布局、问卷列表与 CRUD、题库管理、编辑器、草稿保存与发布版本固化，以及无需登录的公开填写与回答提交。问卷内核（题型模型、schema 校验、作答校验、版本语义）为纯 TypeScript，前后端共用；高级统计图表、条件逻辑执行与邀请流程尚未实现。

## 技术栈

| 层        | 选型                                                          | 当前状态                              |
| --------- | ------------------------------------------------------------- | ------------------------------------- |
| 前端      | Angular 22.3.0（standalone、signals、默认 zoneless，SPA）     | 已接入                                |
| 组件库    | `@tdesign-ng/components`、`styles`、`icons` 0.1.0（精确锁定） | 已接入并完成首轮 PoC                  |
| 后端      | NestJS 12.6.0                                                 | 已接入，健康检查 + 数据源 + 认证      |
| 数据库    | MySQL 8.4 + TypeORM 1.1.3 + mysql2 3.24.6                     | 已接入，租户/认证/问卷/回答实体与迁移 |
| 缓存/队列 | Redis 6.2+ + ioredis 6.1.0                                    | 会话存储已接入，队列未接入            |
| 认证      | 服务端会话 + HS256 访问令牌；密码哈希 Argon2id                | 登录/刷新/登出与 Bearer 守卫已接入    |
| 包管理    | pnpm 12.21.0 + catalog                                        | 已配置                                |

版本生命周期与决策依据见 [技术可行性评估](docs/technical-feasibility-assessment.md)。

## 目录结构

```text
starply-survey/
├─ apps/
│  ├─ web/                  # Angular 22 SPA（管理端 + 公开填写页的壳）
│  └─ api/                  # NestJS API：健康检查、TypeORM 数据源、认证（/auth）
├─ packages/
│  ├─ config/               # 共享 tsconfig / ESLint / Prettier 配置
│  ├─ contracts/            # 跨端 API 契约类型（无实现）
│  ├─ auth-core/            # 登录/刷新/登出、会话生命周期、访问令牌（纯 TS）
│  ├─ tenancy-core/         # 租户标识、/t/{slug} 解析与租户内角色权限（纯 TS）
│  └─ questionnaire-core/   # 问卷内核：题型模型、schema 校验、版本语义（纯 TS）
├─ docs/
│  └─ technical-feasibility-assessment.md
├─ pnpm-workspace.yaml      # workspace + catalog + allowBuilds
├─ tsconfig / eslint / prettier 配置在根与 packages/config
└─ LICENSE                  # MIT
```

## 环境要求

- Node.js：已验证 **22.23.4**；`engines` 同时允许 `^22.22.3 || ^24.15.0 || >=26.0.0`，文档建议的长期基线是 Node 24 LTS。
- pnpm：**12.21.0**（`packageManager` 已固定，建议通过 Corepack 启用）。
- 本机未安装 .nvmrc 中的 Node 版本时，pnpm 12 会拒绝执行；请先 `nvm use` 或安装对应版本。仓库当前 `.nvmrc` 为已验证的 22.23.4。

## 安装

```bash
corepack enable
pnpm install
```

`packages/*` 需要先构建，`apps/api` 在运行时会从 `dist` 解析 `@starply/contracts`。

## 本地启动

```bash
# 1. 构建共享包
pnpm build:packages

# 2. Web（http://localhost:5200）
pnpm dev:web

# 3. API（http://localhost:25200/health）
cp apps/api/.env.example apps/api/.env   # Windows: Copy-Item
pnpm --filter @starply/api db:migrate    # 首次启动前建表
pnpm dev:api
```

开发端口：Web 为 **5200**，API 为 **25200**。Web 开发服务器通过 [proxy.conf.json](apps/web/proxy.conf.json) 把 `/api/*` 转发到 `http://127.0.0.1:25200` 并去掉 `/api` 前缀，例如 `/api/health` → `/health`。

### 默认账号（本地演示）

`pnpm --filter @starply/api db:seed:demo` 使用集中的默认账号配置创建演示租户与 owner，脚本幂等（存在则更新密码与角色）：

| 配置项    | 环境变量                       | 开发默认值         |
| --------- | ------------------------------ | ------------------ |
| 租户 slug | `DEFAULT_ACCOUNT_TENANT_SLUG`  | `acme`             |
| 租户名称  | `DEFAULT_ACCOUNT_TENANT_NAME`  | `Acme 演示租户`    |
| 登录邮箱  | `DEFAULT_ACCOUNT_EMAIL`        | `demo@starply.dev` |
| 登录密码  | `DEFAULT_ACCOUNT_PASSWORD`     | `Starply@2026`     |
| 显示名称  | `DEFAULT_ACCOUNT_DISPLAY_NAME` | `演示管理员`       |

开发默认值集中在 [dev-fixtures](packages/dev-fixtures/src/index.ts)，前端登录页与后端 seed 共用这一份配置：开发构建会预填租户、邮箱与密码，生产构建通过 `environment.production.ts` 替换，不会把测试凭据打进前端包。读取优先级为 `DEFAULT_ACCOUNT_*` > 旧版 `DEMO_*` > 开发默认值；生产环境不读取开发默认值，必须显式配置账号与密码。

健康检查：

- `GET /health`、`GET /health/live`：liveness，只表示进程可用，不依赖数据库。
- `GET /health/ready`：readiness，执行 `SELECT 1`；数据库不可用时返回 **503**，响应体仍包含 `checks.database`。

```json
{
  "status": "ok",
  "service": "starply-api",
  "version": "0.0.0",
  "env": "development",
  "uptime": 1.23,
  "timestamp": "2026-11-24T13:00:00.000Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 2 }
  }
}
```

## 构建与校验

```bash
pnpm build            # packages -> api -> web
pnpm typecheck        # 各包 tsc --noEmit
pnpm lint             # ESLint（flat config）
pnpm format           # Prettier 写入
pnpm test             # Web（Vitest via Angular）+ API（Vitest）
```

## 数据层（TypeORM）

- 版本：**TypeORM 1.1.3**、**mysql2 3.24.6**，精确锁定；不使用预发布版本。
- 实体：`tenant`（含 `status`）、`user`、`membership`、`invitation`、`questionnaire`、`questionnaire_version`、`survey_response`、`question_bank_item`；迁移 `1795000000000-CreateTenant`、`1795900000000-CreateAuthTables`、`1796000000000-CreateQuestionnaireTables`、`1797000000000-CreateSurveyResponseTable`、`1798000000000-CreateQuestionBankItemTable` 已在开发库执行。
- 连接：`apps/api/src/database/data-source-options.ts`，字符集/排序规则显式 `utf8mb4_0900_ai_ci`，`timezone: 'Z'`，连接池默认 10（`MYSQL_POOL_SIZE`），`synchronize` 永久关闭。
- 迁移命令（在仓库根目录执行，需先配置 `apps/api/.env`）：

```bash
pnpm --filter @starply/api db:migrate
pnpm --filter @starply/api db:revert
pnpm --filter @starply/api db:migration:generate src/database/migrations/AddXxx
```

- MySQL DDL 会隐式提交，迁移使用 `migrationsTransactionMode: 'none'`；迁移失败需人工修复，执行前先备份。
- 时间戳由实体 `BeforeInsert`/`BeforeUpdate` 写入 UTC；`repository.update` 不触发实体钩子，更新时需显式传 `updatedAt: new Date()`。
- 数据库不可用时 API 仍会启动并每 5 秒重连，由 `/health/ready` 反映状态。

## 认证（/auth）

- 方案：服务端会话 + 短期访问令牌（D12/D14）。访问令牌为 HS256 JWT，只带 `sub`（用户 id）与 `sid`（会话 id），不携带租户；会话记录存 Redis，键为 `cache:auth:session:{sessionId}`，只保存刷新令牌 secret 的 SHA-256。
- TTL：访问令牌 **15 分钟**、空闲 **7 天**、绝对 **30 天**，由 `@starply/auth-core` 的 `DEFAULT_SESSION_POLICY` 固定，不通过环境变量调整。
- 密码哈希：**Argon2id**（`@node-rs/argon2` 2.2.2，预编译二进制，无需本地编译）；库中保存 PHC 格式字符串。

| 接口                 | 说明                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /auth/login`   | `{ email, password }` → `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn }`；邮箱转小写 |
| `POST /auth/refresh` | `{ refreshToken }` → 同上；旧刷新令牌立即失效，重放会撤销整个会话                                   |
| `POST /auth/logout`  | `{ refreshToken }` → 204，删除服务端会话                                                            |
| `GET /auth/me`       | 需 `Authorization: Bearer {accessToken}` → `{ userId, sessionId, expiresAt }`                       |

- 错误码见 [packages/contracts/src/auth.ts](packages/contracts/src/auth.ts)：`invalid_credentials`、`user_disabled`、`invalid_refresh_token`、`refresh_token_reused`、`session_expired`、`session_idle_timeout`、`token_expired` 等。
- `AUTH_ACCESS_TOKEN_SECRET` **必填**（缺失时 API 启动失败）；多实例必须一致，轮换会让所有已签发的访问令牌立即失效。
- Redis 不可用时登录/刷新/登出返回 **503** `session_store_unavailable`：ioredis 配置 `enableOfflineQueue: false` + `maxRetriesPerRequest: 1`，请求快速失败并后台重连；`GET /auth/me` 只校验签名，不依赖 Redis。
- 数据库不可用时登录返回 **503** `database_unavailable`（`DatabaseService.getDataSource()` 在未连接时即抛 503）。
- 尚未落地：注册与邀请激活（需写 `user` / `membership`）、登录限流。

## 问卷管理（/t/{slug}/questionnaires）

需登录；`TenantContextGuard` 解析租户并校验成员与角色权限。

| 接口                                                 | 权限             | 说明                                                |
| ---------------------------------------------------- | ---------------- | --------------------------------------------------- |
| `POST /t/{slug}/questionnaires`                      | `survey:create`  | 创建问卷，写入空分组草稿                            |
| `GET /t/{slug}/questionnaires`                       | `survey:read`    | 租户级列表，标题取当前草稿                          |
| `GET /t/{slug}/questionnaires/{id}`                  | `survey:read`    | 详情：草稿 + 最新发布版本内容                       |
| `PUT /t/{slug}/questionnaires/{id}/draft`            | `survey:update`  | 覆盖保存草稿，允许半成品                            |
| `POST /t/{slug}/questionnaires/{id}/publish`         | `survey:publish` | 校验草稿并生成不可变发布版本，版本号从 1 递增       |
| `GET /t/{slug}/questionnaires/{id}/stats`            | `survey:read`    | 统计概览：答卷数、发布版本、最近发布时间与按题分布  |
| `GET /t/{slug}/questionnaires/{id}/responses`        | `survey:read`    | 原始答卷分页，默认 20 条，最大 100 条               |
| `GET /t/{slug}/questionnaires/{id}/responses/export` | `survey:read`    | 导出全部答卷为 CSV（UTF-8 BOM，题目列取已发布快照） |
| `DELETE /t/{slug}/questionnaires/{id}`               | `survey:delete`  | 删除问卷，版本与回答级联删除；成功返回 204          |

Web 管理端采用常规中后台布局：顶部 TDesign `TMenu`（问卷管理 / 题库）与下方内容区，路由使用 hash 模式。问卷列表为表格视图，支持搜索、状态筛选、新建、编辑、复制填写链接与删除；进入单份问卷后有「设计 / 统计 / 收集 / 原始数据」页签，统计页使用按需加载的 ECharts 展示选择题与评分题分布，收集页使用前端 `TQRCode` 生成二维码，原始数据页支持按题查看单份答案并导出 CSV。

## 题库（/t/{slug}/question-bank-items）

需登录；题库条目是可复用的题目模板，直接复用 question-core 的 8 种题型模型。

| 接口                                        | 权限                   | 说明                                                |
| ------------------------------------------- | ---------------------- | --------------------------------------------------- |
| `POST /t/{slug}/question-bank-items`        | `question_bank:manage` | 创建条目：type、title、description?、config?、tags? |
| `GET /t/{slug}/question-bank-items`         | `question_bank:read`   | 租户级列表，不含 config，按更新时间倒序             |
| `GET /t/{slug}/question-bank-items/{id}`    | `question_bank:read`   | 详情，包含题型配置                                  |
| `PUT /t/{slug}/question-bank-items/{id}`    | `question_bank:manage` | 局部更新；description/tags 传 null 表示清空         |
| `DELETE /t/{slug}/question-bank-items/{id}` | `question_bank:manage` | 删除条目；成功返回 204                              |

- 权限：owner/admin/editor 可维护题库；viewer 只读。
- Web 入口为顶栏「题库」：列表支持新建、编辑、删除；编辑器可选择题型、维护标题/描述/标签，并提供选择题选项、评分范围、数字范围等基础配置。

## 公开填写（无鉴权）

| 接口                                                  | 说明                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `GET /public/t/{slug}/questionnaires/{id}`            | 返回最新已发布版本内容；租户不存在/停用或未发布时不暴露内容   |
| `POST /public/t/{slug}/questionnaires/{id}/responses` | `{ answers, language? }` → `{ responseId, submittedAt }`，201 |

- `answers` 以题目 id 为键：文本/日期/单选为字符串，数字/评分为数字，多选为字符串数组。
- 提交前由 `@starply/questionnaire-core` 的 `validateSurveyAnswers` 校验：必答、题型匹配、选项存在性、文本长度、数值/评分/日期范围、多选数量与互斥项；未知题目会被拒绝，错误码 `answers_invalid`，`details` 为字段级问题列表。
- 回答记录绑定提交时的发布版本（`questionnaire_version_id` + `version`），后续再发布不影响历史数据。
- Web 填写页为 `/t/{slug}/s/{questionnaireId}`，渲染 8 种题型并支持提交回执；编辑器在已发布时可复制该链接。

## 组件库接入说明

- 依赖：`@tdesign-ng/{components,styles,icons}` 均为精确 `0.1.0`，不使用 `^` 自动升级。
- 样式顺序：`src/styles.less`（theme → reset → 按需组件 Less）之后加载 `@tdesign-ng/components/bridge.css`。
- **新增组件时必须同步引入对应的 `@tdesign-ng/styles/components/*.less`**，否则组件无样式（0.1.0 没有组件级样式入口）。
- 图标为 65 个图标子集，使用 `TIcon` 会打包全部子集；未命中图标会渲染为空并输出控制台警告。
- 骨架示例使用了 `TButton`、`TInput`、`TIcon`。

### 首轮 PoC 结果（2026-11-24）

| 项                                          | 结果                                         |
| ------------------------------------------- | -------------------------------------------- |
| 安装（`strict-peer-dependencies=true`）     | 通过                                         |
| Angular 22 生产构建                         | 通过，initial 约 290 kB raw / 78 kB transfer |
| 样式 Less 深路径导入                        | 通过                                         |
| `ng serve` 本地启动与页面渲染               | 通过，控制台无 error/warning                 |
| zoneless（无 zone.js）                      | 基础通过                                     |
| SSR / 预渲染                                | 未验证（本轮按 SPA 推进）                    |
| 图标覆盖、overlay/table/date-picker、QRCode | 待验证                                       |
| `qrcode` CommonJS 构建提示                  | 已记录，当前未使用 QRCode                    |

`pnpm peers check` 会报 `@angular/build` 可选 wasm 依赖的 `@emnapi/*` 传递性 peer 不匹配，属于上游工具链问题，不影响构建与运行。

## 尚未解决的点

> 用户管理、租户管理与个人中心的设计与实施计划见 [docs/admin-console-design-plan.md](docs/admin-console-design-plan.md)（本轮只设计，不实现）。
> 问卷列表、设计、统计、答卷收集与原始数据的页面设计见 [docs/survey-console-design-plan.md](docs/survey-console-design-plan.md)。
> tdesign-ng 实际可用组件、页面映射与待补能力见 [docs/tdesign-ng-component-priority.md](docs/tdesign-ng-component-priority.md)。

1. Redis 与 BullMQ：ioredis 已用于会话存储并完成登录冒烟；BullMQ 与缓存/队列分实例尚未接入。
2. 仍缺：注册与邀请激活、登录限流、问卷条件逻辑（visibleWhen/jumpRules）执行、回答的时间/IP 筛选、公开填写限流与防刷。
3. SSR/预渲染在组件库场景下未验证；当前默认 SPA。
4. 图标清单是否覆盖首版题型仍待核对。
5. 部署脚本（systemd/Nginx/回滚/备份）尚未落地。
6. JSON 列已用于问卷内容与回答；回答列表分页与按题基础统计已补齐，更复杂的统计维度与多租户条件注入仍待完善。

## 许可

MIT，见 [LICENSE](LICENSE)。第三方组件库 `@tdesign-ng` 同为 MIT。
