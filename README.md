# starply-survey

开源的现代 Web 端问卷系统。目标是使用 Angular + NestJS 构建多租户、中英双语的问卷平台，前后端同仓，使用 pnpm 组织。

当前仓库处于**基础骨架阶段**：可安装、可构建、可本地启动；数据层已接入 TypeORM 并完成最小实体与迁移，业务功能尚未实现。

## 技术栈

| 层        | 选型                                                          | 当前状态                         |
| --------- | ------------------------------------------------------------- | -------------------------------- |
| 前端      | Angular 22.3.0（standalone、signals、默认 zoneless，SPA）     | 已接入                           |
| 组件库    | `@tdesign-ng/components`、`styles`、`icons` 0.1.0（精确锁定） | 已接入并完成首轮 PoC             |
| 后端      | NestJS 12.6.0                                                 | 已接入，健康检查 + 数据源        |
| 数据库    | MySQL 8.4 + TypeORM 1.1.3 + mysql2 3.24.6                     | 已接入，最小 `tenant` 实体与迁移 |
| 缓存/队列 | Redis 6.2+                                                    | 仅配置占位，未接入客户端         |
| 包管理    | pnpm 12.21.0 + catalog                                        | 已配置                           |

版本生命周期与决策依据见 [技术可行性评估](docs/technical-feasibility-assessment.md)。

## 目录结构

```text
starply-survey/
├─ apps/
│  ├─ web/                  # Angular 22 SPA（管理端 + 公开填写页的壳）
│  └─ api/                  # NestJS API：健康检查 + TypeORM 数据源
├─ packages/
│  ├─ config/               # 共享 tsconfig / ESLint / Prettier 配置
│  ├─ contracts/            # 跨端 API 契约类型（无实现）
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

1. Redis 客户端、BullMQ 与缓存/队列分实例尚未接入。
2. 认证与租户模型未实现；问卷内核已提供领域模型、schema 校验与草稿/发布版本语义，但逻辑引擎尚未实现。
3. SSR/预渲染在组件库场景下未验证；当前默认 SPA。
4. 图标清单是否覆盖首版题型仍待核对。
5. 部署脚本（systemd/Nginx/回滚/备份）尚未落地。
6. TypeORM 的 JSON 列、分页统计、复杂查询与多租户条件注入仍待 PoC。

## 许可

MIT，见 [LICENSE](LICENSE)。第三方组件库 `@tdesign-ng` 同为 MIT。
