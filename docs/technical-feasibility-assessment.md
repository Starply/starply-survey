# starply-survey 技术可行性评估

- 文档状态：Draft（第三轮，已核查 `@tdesign-ng` 组件库）
- 初评日期：2026-11-24
- 决策更新：2026-11-24
- 评估范围：技术栈可行性、单仓与包组织、Angular/NestJS 关键选型与版本策略、MySQL/Redis 职责边界、多租户与部署约束、组件库 `@tdesign-ng` 核查与接入、风险与待确认事项
- 不在范围内：业务代码、数据库 DDL、接口定义、UI 设计稿
- 结论有效期：版本基线与生态信息变化较快，实施时应以当时的 lockfile 与官方文档为准

### 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-24 | 初版：技术栈、单仓、选型、MySQL/Redis 边界、组件库风险 |
| 2026-11-24 | 第二轮：吸收 MIT、多租户、非 Docker 部署、MySQL 8.x、Redis 6.x、中英双语、基础题型优先等决策；补充租户隔离、非容器化运维与 Redis 生命周期约束；将待确认项改为“选项 + 建议 + 理由” |
| 2026-11-24 | 第三轮：确认共享库 + `tenant_id`、首版显示/跳转逻辑；实际核查 `@tdesign-ng` 三包（0.1.0 预发布），结论为“有条件采用”，新增 §8 核查结论与发布前修正清单 |

---

## 1. 结论摘要

**总体结论：可行，但有明确的前置条件。** Angular + NestJS + MySQL + Redis 与 pnpm 单仓足以支撑一个多租户问卷系统，不存在硬性技术阻塞；但以下条件必须在动工前锁定，否则会在数据模型或上线阶段返工：

1. **MySQL 建议落在 8.4 LTS**：MySQL 8.0 已于 2026-04-21 进入 EOL/Sustaining Support，8.x 范围内仍受支持的 LTS 选择是 8.4（待用户确认）。
2. **Redis 必须是 6.2.x，且不能长期停留**：BullMQ 要求 Redis ≥ 6.2，6.0/6.1 不可用；Redis 6.2 的官方 EOL 为 2027-04-01，需要预留升级到 7.2/7.4 LTS 或 8.2 LTS 的窗口。
3. **多租户隔离必须落到代码结构**：已确认共享库 + `tenant_id`；MySQL 没有行级安全（RLS），隔离正确性主要靠统一仓储入口、复合索引与越权测试。
4. **组件库已发布，但属于 0.1.0 预发布**：`@tdesign-ng` 三个包已在骨架中完成安装、Angular 22 生产构建与本地启动验证（SPA + zoneless 基础场景），结论为“有条件采用”；SSR、图标覆盖与复杂组件仍未闭环，见 §8.10–§8.13。

| 评估维度 | 结论 | 说明 |
|---|---|---|
| 技术栈整体 | 可行 | 四个组件成熟，社区与文档完备 |
| pnpm 单仓 | 可行 | `apps/* + packages/*`，catalog 统一版本 |
| Angular 选型 | 可行 | 建议 v22 基线；按管理端/填写页拆分渲染策略 |
| NestJS 选型 | 可行 | 模块化适配多租户与问卷领域；ORM 待定 |
| MySQL 8.x | 可行 | **建议 8.4 LTS**；8.0 已 EOL |
| Redis 6.x | 有条件可行 | **必须 6.2+**；EOL 2027-04-01，需升级余量 |
| 多租户 | 已定：共享库 + `tenant_id` | 应用层强隔离；复合索引与越权测试 |
| 非 Docker 部署 | 可行，运维成本上升 | systemd + Nginx + 备份/回滚脚本 |
| 组件库 `@tdesign-ng` | 有条件采用 | 0.1.0 预发布；Angular 22/SSR/zoneless/图标需验证 |
| 开源许可 | 已定 MIT | 仍需补 LICENSE 文件与第三方声明 |
| 中英双语 | 可行 | 翻译内容存 JSON，暂不支持 RTL |

### 1.1 已确认决策

| 编号 | 决策项 | 结论 | 对方案的主要影响 |
|---|---|---|---|
| D1 | 开源协议 | MIT | 依赖可保持宽松许可；需补 LICENSE 与第三方声明 |
| D2 | 多租户 | **共享库 + `tenant_id`**；面向多家企业，企业内多个员工共同维护 | 租户模型、成员/角色、租户级隔离与配额 |
| D3 | 部署方式 | 云服务器直接部署，不使用 Docker | systemd/Nginx/发布目录/备份/回滚需自建 |
| D4 | 数据库 | MySQL 8.x | 8.x 内建议 8.4 LTS；8.0 已 EOL |
| D5 | 缓存 | Redis 6.x | 必须 ≥ 6.2；EOL 2027-04-01 |
| D6 | 国际化 | 中英双语 | UI 与问卷内容双语；无 RTL 需求 |
| D7 | 题型范围 | 与主流问卷系统基本一致；**首版包含基础题型 + 显示/跳转逻辑**，矩阵等复杂题型后置 | schema 需支持可扩展的题型联合；逻辑引擎进首版，矩阵不阻塞首版 |

### 1.2 需要用户确认的建议项

以下建议只用于帮助逐条确认，不替代决策：组件库前置条件、部署拓扑与容量档位、防重复策略、统计实时性、附件存储、Redis 升级路径等。完整选项与理由见第 11 节。

---

## 2. 评估依据

- 仓库现状：仅有 `README.md`（“开源的现代web端问卷系统”）与一次 `Initial commit`，无脚手架、无依赖、无 LICENSE 文件。
- 许可决策：已确认采用 **MIT**，但 `LICENSE` 文件尚未创建（见 13 节行动项）。
- 版本信息：2026-11-24 通过 npm registry `dist-tags`、`engines`、`peerDependencies` 查询取得；仅代表查询时点，不等同于长期建议。
- 生命周期信息：Angular 官方 Releases、Node.js 官方 Releases、Redis 官方产品生命周期文档、BullMQ 官方文档、Oracle MySQL EOL 公告。
- 组件库信息：2026-11-24 从 npm registry 查询 `@tdesign-ng/components`、`@tdesign-ng/styles`、`@tdesign-ng/icons` 的 `dist-tags`、发布时间、`peerDependencies` 与许可证，并下载 0.1.0 tarball 检查 `package.json`、APF 产物、类型声明、样式/图标资源；同时访问其在线文档站。**未在 Angular 22 工程中实际构建或 SSR 渲染**，相关项标注为【待确认】。
- 未核实的内容一律标记为【待确认】，不给出推测性版本号。

### 2.1 版本基线（查询时点）

| 组件 | 版本 / registry `latest` | 备注 |
|---|---|---|
| `@angular/core` / `@angular/cli` / `@angular/cdk` / `@angular/aria` / `@angular/ssr` | 22.3.0 | v22.0.0 发布于 2026-06-03 |
| `@tdesign-ng/components` / `styles` / `icons` | 0.1.0 | 2026-11-24 发布；MIT；作者标注为预发布，详见第 8 节 |
| `@nestjs/core` | 12.6.0 | `engines.node >= 20` |
| `@nestjs/cli` | 12.0.15 | — |
| `@nestjs/config` / `@nestjs/swagger` / `@nestjs/typeorm` | 12.1.1 / 12.1.2 / 12.0.3 | 与 Nest 12 同代 |
| `typeorm` | 1.1.3 | 1.0.0 发布于 2026-05-19；0.3.x 被标记为 `legacy` |
| `prisma` | 8.0.0-rc.35（`prev`: 7.10.1） | **`latest` 指向 RC**，不可盲装 |
| `mysql2` | 3.24.6 | Node 驱动；需在 8.4 LTS 上验证 |
| `ioredis` / `redis` | 6.1.0 / 6.4.0 | BullMQ 支持 ioredis / node-redis 等客户端 |
| `bullmq` | 6.7.10 | **要求 Redis ≥ 6.2** |
| `zod` | 4.6.7 | 可用于共享契约校验 |
| `pnpm` | 12.23.0 | 支持 catalog、`catalogMode` |
| Node.js | 24.22.3 LTS（Krypton）/ 26.13.1 LTS（Lithium） | Angular 22 要求 `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` |
| MySQL | 8.4 LTS（建议） | **8.0 于 2026-04-21 EOL**，不要用于新项目 |
| Redis | 6.2.x（公开可见补丁 6.2.19） | **LTS，EOL 2027-04-01**；6.0/6.1 不满足 BullMQ |

> 说明：Angular 22 的 `engines` 与 NestJS 12 的 `engines` 存在交集，Node 24.x 同时满足二者，是当前最稳妥的收敛点。

---

## 3. 技术栈与单仓结构可行性

### 3.1 为什么可行

- Angular 与 NestJS 同为 TypeScript 技术栈，语言、工具链、包管理一致，单仓内共享类型和校验逻辑成本低。
- NestJS 的模块/依赖注入模型与问卷领域（租户、成员、问卷、答卷、统计、导出、鉴权）边界清晰，适合按模块拆分。
- Angular 的 standalone 组件、signals、Signal Forms 在 v22 已稳定，适合构建交互复杂的问卷编辑器与填写页。
- MySQL 适合承载强一致的事务数据（租户、发布版本、答卷提交、配额），Redis 适合承担缓存、限流、幂等与异步任务，两者职责可清晰切分。
- pnpm workspace 的 `workspace:` 协议与 catalog 能保证 Angular 全家桶版本一致，避免多包版本漂移。

### 3.2 不建议现在引入的东西

- **Nx / Turborepo**：当前只有两个应用、少量共享包，引入后收益不足以抵消学习与维护成本。等出现多应用、多团队或构建时间成为瓶颈时再评估。
- **微服务 / 消息中间件**：多租户不等于必须拆服务；MVP 阶段用单体 NestJS + Redis 队列足够，过早拆分只会增加分布式一致性负担。
- **在仓库内 fork 或内联修改组件库**：`@tdesign-ng` 已作为独立 npm 包发布，本仓库应作为消费方；修复应回到组件库仓库，避免发布流程与业务仓库耦合。
- **为“未来可能的多语言”预留完整 i18n 框架**：已明确中英双语，按两种语言设计即可，但数据结构不要写死为两列。

### 3.3 已定约束对架构的影响

| 约束 | 架构影响 |
|---|---|
| 多租户、企业内多人协作 | 所有租户数据带 `tenant_id`；引入 `tenant`、`membership`、`invitation`；权限按租户内角色判断；缓存/QUEUE/文件路径带租户维度 |
| 云服务器直接部署、不用 Docker | 需要 systemd、Nginx、TLS、发布目录、回滚、备份、日志轮转、监控；环境一致性靠版本锁定与脚本，而非镜像 |
| MySQL 8.x | 使用 8.4 LTS；利用 JSON、生成列、复合索引；迁移文件入库；关闭 `synchronize` |
| Redis 6.x | 限定 6.2.x；使用 ACL/TLS、Lua、Streams 等 6.x 能力；不依赖 7.x 的 Functions/分片 Pub/Sub |
| 首版题型 + 显示/跳转逻辑 | 题型定义为可判别联合；逻辑规则作为版本化配置存储；矩阵/排序/文件等后续类型通过新增 `type` + `config` 扩展，不重建表 |
| 中英双语 | UI 用 `@angular/localize`；问卷内容按 locale 存翻译 JSON；不做 RTL |
| 组件库 `@tdesign-ng` 0.1.0 | UI 直接消费 TDesign 组件与 `--td-*` tokens；锁定精确版本；需先验证 Angular 22、SSR/zoneless、图标与样式引入 |

---

## 4. 推荐的仓库与包组织

```text
starply-survey/
├─ apps/
│  ├─ web/                     # Angular 22 应用（管理端 + 公开填写页）
│  ├─ api/                     # NestJS 12 应用（HTTP API）
│  └─ worker/                  # 可选：BullMQ 消费者（导出、统计、清理）
├─ packages/
│  ├─ contracts/               # 纯 TS 类型 / Zod schema / OpenAPI 生成产物
│  ├─ questionnaire-core/      # 问卷 schema、条件逻辑、校验、评分（零框架依赖）
│  └─ config/                  # 共享 tsconfig / eslint / prettier 配置（可选）
├─ infra/
│  ├─ systemd/                 # api/web/worker 的 service unit
│  ├─ nginx/                   # 反向代理、TLS、静态资源
│  ├─ scripts/                 # 发布、回滚、备份、健康检查
│  └─ sql/                     # 初始化与运维 SQL（非业务迁移）
├─ docs/
├─ pnpm-workspace.yaml
├─ package.json                # 根脚本与 packageManager
└─ .npmrc
```

> 不使用 Docker，因此 `infra/` 不再放 `docker-compose.yml`，而是放可直接执行的 systemd/Nginx/发布脚本；部署文档与脚本必须一起进仓库。

### 4.1 关键约定

1. **`questionnaire-core` 必须是纯 TypeScript**：不依赖 Angular、NestJS、数据库驱动。前端负责即时校验与逻辑跳转，后端负责提交时的最终校验，双方复用同一份实现，避免“前端能填、后端拒绝”的语义漂移。
2. **`contracts` 只放契约，不放实现**：API 请求/响应类型、枚举、错误码。不要把 NestJS 的 DTO 装饰器或 Angular 的 Injectable 放进共享包。
3. **不直接复用后端 DTO 到前端**：后端 DTO 带 `class-validator`/Swagger 装饰器，直接引用会污染前端构建与包体。推荐由 `@nestjs/swagger` 输出 OpenAPI，前端生成类型（生成工具【待确认】）。
4. **内部包用 `workspace:*`**：发布到 npm 的组件库属于外部依赖，不走 workspace 协议。
5. **根 `package.json` 只放编排脚本**：`dev`、`build`、`test`、`lint`、`db:migrate`、`deploy`、`rollback` 等。

### 4.2 pnpm 配置建议

- `packageManager` 字段固定 pnpm 版本，配合 Corepack，保证本地与 CI 一致。
- 使用 **catalog** 统一 Angular 全家桶、NestJS 全家桶、TypeScript、ESLint 的版本。
- 可开启 `catalogMode: strict`，强制新依赖必须来自 catalog，减少版本漂移。
- `strict-peer-dependencies` 建议在组件库接入阶段开启，以便尽早暴露 peer 版本不匹配。
- 仅在确有工具要求扁平 `node_modules` 时才使用 `node-linker=hoisted`，不要作为默认配置。
- Angular CLI、Nest CLI 与 pnpm 12 的兼容性需在脚手架落地时实际验证（安装、构建、生产打包、`pnpm deploy --prod`）。

### 4.3 非 Docker 下的工程化补充

- 生产包建议用 `pnpm deploy --prod` 生成独立目录，避免把整个 workspace 带到服务器。
- 发布采用“版本目录 + current 软链接”：构建产物上传到 `releases/<version>`，切换软链接后重启 systemd，回滚即切回旧链接。
- 数据库迁移与代码发布解耦：先执行向后兼容的迁移，再切换应用，避免不可逆变更。
- 配置管理建议使用 Ansible/脚本或云厂商的启动脚本，确保新机器可重复搭建。

---

## 5. Angular 关键选型与版本策略

### 5.1 版本基线

- 采用 **Angular 22.x**（查询时 `latest` 为 22.3.0）。官方策略为每个 major 支持约 24 个月（12 个月 Active + 12 个月 LTS），v22 的 Active 期至 2027-06，LTS 至 2028-06。
- Angular 目前为**每 12 个月一个 major**（官方 Releases 页面），升级节奏比早期更可控，但仍需预留迁移窗口。
- Angular 全家桶（`@angular/*`）必须严格同版本，用 catalog 锁定；不要混用不同 minor。

### 5.2 建议采用的能力

| 能力 | 建议 | 理由 |
|---|---|---|
| standalone 组件 | 采用 | 官方默认方向，减少 NgModule 样板 |
| signals | 采用 | 本地状态、派生状态、跨组件共享更直观 |
| Signal Forms | 评估后采用（v22 已稳定） | 新建项目可直接作为表单基线；动态问卷的复杂表单仍需 PoC |
| Angular Aria / CDK | 采用 | 提供无样式、可访问性良好的行为原语，可补足 TDesign 未覆盖的交互 |
| `@tdesign-ng` 组件 | 有条件采用 | 73 个组件覆盖基础题型；0.1.0 预发布，需先完成 Angular 22/SSR/zoneless 验证 |
| RxJS | 保留 | HTTP、事件流、复杂异步编排仍需要 |
| NgRx | 暂不引入 | MVP 阶段 signals + service 足够；状态复杂后再评估 |
| `httpResource` / `resource` | 可选 | 适合声明式数据获取；需确认与拦截器、错误处理的配合 |

### 5.3 渲染模式

问卷系统有两类页面，渲染诉求不同：

- **公开填写页**：移动端首屏速度、分享卡片、可访问性是重点。建议初期采用 SPA + 静态托管，落地页做预渲染；保留 SSR 能力（隔离 `window`/`document` 访问）。
- **管理端**：登录后使用，SEO 无意义，保持 CSR 即可。

**非 Docker 部署下的额外判断**：SSR 需要常驻 Node 进程、额外的部署与缓存策略，运维复杂度高于纯静态。若公开问卷不需要搜索引擎收录，建议先不上全站 SSR；等有明确增长诉求再启用 `@angular/ssr`。此外，`@tdesign-ng` 0.1.0 **未声明 SSR 支持**，包内存在直接访问 `window`/`document`/`getComputedStyle` 的代码；在启用 SSR 或预渲染前，必须先做冒烟测试（见第 8 节）。

### 5.4 样式与设计系统

- **以 TDesign 的 `--td-*` CSS 变量作为 token 基线**，项目只补充品牌色、布局与业务语义 token；不要另建一套与 TDesign 冲突的命名体系。
- 组件使用 `ViewEncapsulation.None` 并通过 `bridge.css` 映射样式，业务层应通过 token 与少量桥接类定制，避免 `::ng-deep` 或覆盖组件内部 DOM。
- 多租户若需要“企业品牌色”，把品牌色作为租户配置映射到 `--td-brand-color*` 等 token，而不是为每个租户复制样式。
- 暗色模式依赖 `theme-mode="dark"` 属性（不是自动 `prefers-color-scheme`），需要在应用壳层统一设置并持久化。

### 5.5 国际化（中英双语）

- UI 文案使用 `@angular/localize`，提供 `zh-CN` 与 `en`；语言选择持久化到用户/租户偏好。
- 问卷内容作为**数据**存储：在 `survey_version` 的题目/选项/说明上存 `translations: { "zh-CN": ..., "en": ... }`，并指定默认语言与回退规则。不要为每种语言加一列，也不要把问卷文案塞进前端翻译文件。
- 错误提示使用错误码 + 前端翻译；邮件/通知按接收人语言渲染。
- 当前不做 RTL、不做第三种语言；数据结构保留扩展空间即可。
- 时区、日期/数字格式、租户默认语言仍属【待确认】（见 Q10）。

### 5.6 多租户下的前端结构

- 租户通过 URL 识别，建议公开链接形如 `/t/{tenantSlug}/s/{surveySlug}`，管理端形如 `/t/{tenantSlug}/admin/...`。这样无需通配符域名与泛域名证书，非 Docker 部署更简单。
- 路由解析阶段加载租户公开信息（名称、默认语言、品牌 token），并校验当前用户是否属于该租户；不要在全局单例里缓存“当前租户”，避免切换租户时串数据。
- 一个用户可属于多个企业：管理端提供租户切换；JWT 不硬编码单一租户，租户上下文由路由 + 成员校验确定。
- 公开填写页不要求登录，租户由问卷链接解析；提交时后端仍需校验问卷归属与发布状态。
- 自定义域名、独立品牌门户属于后续能力，暂不作为 MVP 前提。

---

## 6. NestJS 关键选型与版本策略

### 6.1 版本基线

- 采用 **NestJS 12.x**（查询时 `latest` 为 12.6.0）。
- NestJS 官方 support 页面未给出类似 Angular 的公开 LTS 时间表（截至查询日）。策略应是：锁定 minor、跟随安全更新、在每个 major 发布后评估升级。
- Node 运行时建议 **Node 24.x LTS**（同时满足 Angular 22 与 NestJS 12 的 `engines`）。

### 6.2 模块划分（建议）

```text
apps/api/src/
├─ tenants/         # 租户、成员、邀请、角色
├─ auth/            # 登录、令牌、会话
├─ users/           # 全局用户身份
├─ surveys/         # 问卷草稿、版本、发布
├─ responses/       # 答卷提交、查询、导出
├─ analytics/       # 聚合统计（可先同步查询，后续异步）
├─ files/           # 附件上传（对象存储，后置题型需要）
├─ common/          # 过滤器、拦截器、管道、错误码
└─ infra/           # 数据库、Redis、队列、配置、健康检查
```

模块边界按业务能力划分，不按技术层划分；跨模块通过 service 接口调用，避免直接跨模块操作对方的表。

### 6.3 ORM 选型（待定，需决策）

| 方案 | 优势 | 风险 |
|---|---|---|
| TypeORM 1.x | Nest 官方集成成熟；实体/迁移/QueryBuilder 齐全；`@nestjs/typeorm` 12 已声明兼容 `^1.0.0-dev` | 1.0 为 2026-05 才发布的新 major，社区资料与周边工具仍以 0.3.x 为主；需验证迁移、JSON 列、复杂查询表现 |
| Prisma 7.x 稳定版 | 类型安全强、迁移体验好、生态活跃 | 查询灵活性弱于 QueryBuilder；动态 JSON 过滤受限；`latest` 当前指向 8.0.0-rc，必须显式锁稳定版 |

建议：

- 若团队更看重 Nest 原生集成与 SQL 可控性，选 TypeORM，但**先做 PoC**：JSON 答案列、分页统计、迁移回滚、连接池、多租户条件注入。
- 若团队更看重类型安全与迁移纪律，选 Prisma 稳定版，并显式锁定 `7.x`（不要被 `latest` 的 RC 带走）。
- 无论选哪种，**迁移文件必须进仓库**，生产环境禁止 `synchronize`。

### 6.4 其他关键选型

| 关注点 | 建议 |
|---|---|
| 参数校验 | `ValidationPipe`（`whitelist`、`forbidNonWhitelisted`、`transform`）+ `class-validator`；答卷内容再经 `questionnaire-core` 做语义校验 |
| API 文档 | `@nestjs/swagger` 输出 OpenAPI，作为前端类型生成的唯一契约来源 |
| 鉴权 | JWT access + refresh 轮换；密码哈希用 Argon2；管理与填写分权；租户成员关系每次请求校验 |
| 限流 | `@nestjs/throttler` + Redis 存储，按租户 + IP 双维度；Redis 6.2 支持所需能力 |
| 队列 | BullMQ（**Redis ≥ 6.2**）；导出/统计/清理走异步；任务负载必须带 `tenantId` |
| 文件上传 | 对象存储（S3 兼容），不要把文件存 MySQL BLOB；存储方案【待确认】 |
| 配置 | `@nestjs/config` + Zod 校验环境变量，启动即失败 |
| 日志 | 结构化日志（pino），带 request id/tenant id；生产不打印答卷原文 |
| 健康检查 | `@nestjs/terminus`：MySQL、Redis、磁盘/对象存储 |
| 可观测性 | 先做日志与指标；多实例时按实例维度采集 |

### 6.5 多租户隔离的实现约束

MySQL 没有 RLS，隔离不能依赖数据库自动完成，必须把规则写进代码结构：

1. **租户上下文**：Guard 从路由/JWT 解析 `tenantId`，校验成员关系与角色，然后注入请求上下文。服务层方法显式接收 `tenantId`，不依赖隐式全局状态。
2. **查询强制带租户**：所有仓储方法签名包含 `tenantId`；禁止无租户条件的 `find`/`query`；复杂 SQL 需在 code review 中重点检查。
3. **复合约束**：唯一索引包含 `tenant_id`（如 `(tenant_id, slug)`），避免跨租户冲突或误判。
4. **越权测试**：为每个资源写“用 A 租户身份访问 B 租户资源”的集成测试，覆盖读、写、删除、导出。
5. **缓存与队列**：Redis key 前缀包含租户；队列任务携带 `tenantId`，消费者再次校验资源归属。
6. **审计**：登录、成员变更、问卷发布、数据导出、删除等操作写租户级审计日志。
7. **公共接口**：公开问卷读取/提交按 `tenantSlug + surveySlug` 定位，禁止仅凭全局自增 ID 暴露资源。

### 6.6 非 Docker 部署要点

| 关注点 | 建议 |
|---|---|
| 进程管理 | systemd 管理 `api`、`web`（若 SSR）、`worker`；配置 `Restart=always`、`EnvironmentFile`、资源限制 |
| 反向代理 | Nginx 终止 TLS、静态资源缓存、`/api` 反代；证书用 ACME 自动续期 |
| 发布 | 版本目录 + `current` 软链接 + 重启；保留最近 N 个版本用于回滚 |
| 优雅退出 | 开启 Nest shutdown hooks，等待在途请求与队列任务；Nginx 先摘流量再停进程 |
| 配置与密钥 | 环境文件权限 600 或云密钥管理；不要把密钥写进仓库 |
| 日志 | journald + logrotate；应用日志按天轮转并限制保留 |
| 备份 | MySQL 全量 + binlog；Redis RDB/AOF；备份到对象存储并定期演练恢复 |
| 监控 | 主机指标 + 应用健康检查 + 关键业务指标（提交成功率、队列积压） |
| 环境一致性 | 固定 OS 版本、Node 版本、MySQL/Redis 小版本；新机器用脚本重建，避免“手工漂移” |

---

## 7. MySQL 与 Redis 的职责边界

### 7.1 原则

- **MySQL 是唯一权威数据源（system of record）**：任何“丢了就不能恢复”的数据只能落 MySQL。
- **Redis 是可丢的加速层**：缓存、限流、幂等键、分布式锁、队列。Redis 故障时应能降级到数据库，而不是丢数据。
- **唯一性/配额等正确性约束必须有数据库兜底**：不能只靠 Redis 计数器。
- **所有租户数据必须可归属、可导出、可删除**：这是多租户产品的基本能力。

### 7.2 职责划分

| 数据/能力 | MySQL | Redis | 说明 |
|---|---|---|---|
| 租户、成员、角色、邀请 | 权威 | 可选缓存 | 成员变更需主动失效 |
| 用户身份 | 权威 | 会话缓存 | 一个用户可属于多个租户 |
| 问卷草稿 | 权威 | 不缓存 | 编辑态强一致 |
| 问卷发布版本 | 权威（不可变快照） | 缓存已发布定义 | 版本不可变，key 带版本号，天然免失效 |
| 答卷与答案 | 权威 | 不落唯一副本 | 提交成功即入库 |
| 重复提交判定 | 唯一索引 | 幂等键加速 | 以数据库唯一约束为准 |
| 租户配额/问卷名额 | 事务内原子更新 | 快速预检查 | 预检查失败即拒绝；成功仍以 DB 为准 |
| 统计聚合 | 结果表/物化结果 | 热点缓存 | 大数据量再引入异步汇总 |
| 导出任务 | 任务记录 + 产物元数据 | 队列 | 产物存对象存储，任务状态以 DB 为准 |
| 限流 | 不需要 | 计数器 + TTL | 按租户 + IP，允许少量误差 |
| 会话/刷新令牌 | 可选审计 | 允许列表/黑名单 | 以安全策略为准 |
| 分布式锁 | 不需要 | `SET NX PX` | 仅避免重复任务，不承担业务正确性 |

### 7.3 数据模型要点

- **租户为第一等实体**：`tenant`（id、slug、名称、状态、默认语言、时区、品牌配置）；`user` 为全局身份；`membership`（tenant_id、user_id、role、status）唯一约束 `(tenant_id, user_id)`；`invitation` 记录邀请与过期时间。
- **业务表统一带 `tenant_id`**：问卷、版本、答卷、导出任务、审计日志、文件元数据等；索引以 `(tenant_id, ...)` 开头。
- **问卷版本化**：`survey`（可变草稿）与 `survey_version`（发布后不可变）分离；答卷必须绑定具体 `survey_version_id`。历史答卷不会因编辑问卷而语义漂移。
- **题型用可判别联合描述**：`{ type, version, config }`；答案按题型存 JSON。矩阵、排序、文件等后续题型只新增 `type` 与渲染/校验实现，不需要改表结构。
- **答案存储二选一**【待确认】：
  - 方案 A：`response` 一行 + `answers` JSON 列，写入简单、读取整卷方便，适合 MVP；
  - 方案 B：`answer` 明细表（每题一行），便于跨问卷聚合与索引，但写入行数放大。
  - 建议 MVP 用 A，并在 `response` 上为高频过滤字段建生成列/索引；当分析需求明确后再演进。
- **必须有的索引/约束**：`response(tenant_id, survey_version_id, submitted_at)`、提交幂等键唯一索引、防重复提交唯一索引（匿名场景用 respondent token/hash）。
- **基础题型优先**：首版建议覆盖单行/多行文本、数字、邮箱、日期、单选（radio/下拉）、多选、评分/NPS；矩阵、排序、文件、级联、地址、签名放到后续版本。具体清单见 8.5。

### 7.4 缓存与一致性策略

- **cache-aside**：读缓存 → 未命中查库 → 回填并设 TTL；写库后删除/更新缓存。
- 已发布问卷版本不可变，缓存 key 直接包含 `tenantId + versionId`，发布新版本即自然切换。
- 缓存击穿：对热点问卷定义使用短锁或逻辑过期；缓存雪崩：TTL 加随机抖动。
- Redis 不可用时：问卷填写读路径降级为直接查 MySQL；写路径不依赖 Redis 才能成功（限流可短暂放宽并告警）。
- 不建议用 Redis 逻辑库（`SELECT 1/2`）做租户隔离：Redis Cluster 只有 DB 0，且逻辑库不利于观测。统一用 key 前缀 `t:{tenantId}:...`。

### 7.5 MySQL 8.x 的现实约束

- **MySQL 8.0 已于 2026-04-21 EOL**（8.0.46 为末期版本，进入 Oracle Sustaining Support）。新项目不应从 8.0 起步。
- 在 8.x 范围内，**建议 8.4 LTS**：仍在新项目可用的 LTS 线上，具备 JSON、生成列、多值索引、CHECK、CTE、窗口函数等本方案需要的能力。
- 8.4 对部分旧特性/默认值有调整，安装与迁移时需按官方升级检查清单核对（尤其是认证插件与旧客户端）【待确认目标环境】。
- 安装来源：主流发行版默认仓库未必提供 8.4，通常需要 Oracle 官方 APT/YUM 仓库；非 Docker 部署下要固定小版本并纳入补丁计划。
- 运维：开启 binlog、慢查询日志；备份采用全量 + binlog 增量；大表按租户/问卷归档需要提前设计。

### 7.6 Redis 6.x 的现实约束与结论

**事实约束：**

1. **版本下限**：BullMQ 明确要求 Redis **6.2 或更高**（或 Valkey/Dragonfly 等兼容服务）。因此“Redis 6.x”必须落实为 **6.2.x**，6.0/6.1 不可用于本方案。
2. **生命周期**：Redis 官方数据库版本支持模型将 6.2 定位为 LTS，**EOL 为 2027-04-01**；该模型同时适用于 Redis Open Source、Redis Cloud 与 Redis Software。距当前（2026-11）约 4 个月，之后不再获得官方安全补丁与重大缺陷修复。
3. **补丁现状**：6.2 线公开可见较新补丁为 6.2.19（包含 2025 年安全修复）；预计 2027-04 前的补丁会逐步减少，自建部署需要自行跟踪 CVE。
4. **能力缺口**：6.2 不具备 7.x 的 Redis Functions、分片 Pub/Sub、多部分 AOF 等特性。本方案的缓存、限流、Lua、Streams、BullMQ 均可在 6.2 上实现，因此**功能上不阻塞**。
5. **客户端影响**：BullMQ 与主流 Node 客户端仍支持 RESP2/Redis 6.2，当前没有“必须升级客户端”的问题；但新版本客户端可能逐步把最低 Redis 版本抬高，需要锁定客户端版本并关注发布说明。
6. **部署来源**：较新的 Linux 发行版通常自带 Redis 7.x，安装 6.2 往往需要额外仓库或源码编译，补丁维护成本更高【需按目标 OS 核实】。

**判断：可行，但生命周期余量不足，不能作为长期基线。**

- 如果 6.2 是既定约束（例如云厂商只提供该版本），可以首发使用，但必须同时准备升级路径，并在 2027-04 前完成迁移。
- 如果是自建，建议**在首次生产部署时就完成 7.2/7.4 LTS 或 8.2 LTS 的兼容性验证**，把升级作为常规运维，而不是到期救火。
- 升级候选（官方 EOL 数据）：Redis 7.2 / 7.4 LTS 至 2029-12-01；Redis 8.2 LTS 至 2030-09-01。**不要选 8.0（2026-12-01 EOL）或 8.4（2027-01-01 EOL）这类 STS 版本**。
- 替代方案：Valkey（BSD-3）协议兼容，适合对许可或生命周期敏感的场景，但需实测 BullMQ/客户端兼容性【待确认】。

### 7.7 多租户隔离的数据库策略

- **已定：共享数据库 + 共享 schema + `tenant_id`**（D2）：多租户 SaaS 的常规起点，成本与运维复杂度最低，适合非 Docker、中小规模起步。
- 不推荐首版采用“每租户一库/一 schema”：迁移、备份、连接池、监控都会随租户数线性增长；等出现明确的大客户独占部署需求再提供“专属实例”。
- 隔离正确性靠：统一仓储入口、复合索引、越权集成测试、审计日志、代码审查规则。
- 租户级配额（问卷数、答卷数、成员数、存储量）在 MySQL 事务内扣减，Redis 仅做快速预检。
- 数据生命周期：租户注销/删除需要支持导出与延迟硬删除；保留期可配置【待确认】。

---

## 8. 组件库 `@tdesign-ng` 核查结论

### 8.1 核查范围与方法

- 查询 npm registry：`dist-tags`、版本列表、发布时间、`peerDependencies`、`engines`、`license`。
- 下载并解压 `@tdesign-ng/components@0.1.0`、`@tdesign-ng/styles@0.1.0`、`@tdesign-ng/icons@0.1.0` 的 tarball，检查 `package.json`、FESM/类型声明、样式与图标资源、许可证。
- 访问在线文档站，确认组件文档与 API 表可用。
- **限制**：未在 Angular 22 工程中实际安装、构建或 SSR 渲染；下文中涉及运行时的判断均标注【待确认】。

### 8.2 包与版本事实

| 包 | `latest` | 发布时间 | 体积/文件数 | 主要结构 | 许可 |
|---|---|---|---|---|---|
| `@tdesign-ng/components` | 0.1.0 | 2026-11-24 | 解压约 5.2 MB / 336 个文件；FESM 约 1.85 MB + source map | `fesm2022/`、`index.d.ts`、`types/`、73 个组件、`bridge.css/less` | MIT |
| `@tdesign-ng/styles` | 0.1.0 | 2026-11-24 | 解压约 1.76 MB / 353 个文件 | `index.less`、`theme.less`、`global.less`、组件 Less、`dist/` CSS | MIT |
| `@tdesign-ng/icons` | 0.1.0 | 2026-11-24 | 约 87 KB / 8 个文件；FESM 约 36 KB | `TIcon` 组件 + 65 个内置图标的 `TD_ICONS` 记录 | MIT |

- 三个包的版本列表均为 `0.0.0-stage` 与 `0.1.0`，`latest` 指向 **0.1.0**，**没有把 `0.0.0-stage` 暴露为 `latest`**。
- 但 `components` 的 README 明确写“0.1.0 是首个公开预发布版本（pre-release）”，因此不能把 `latest` 理解为稳定版；0.x 的 minor 升级允许破坏性变更。
- `components` 的 peerDependencies：`@angular/common`、`@angular/core`、`@angular/forms`、`@angular/cdk` 均为 **`>=19 <24`**，`@tdesign-ng/styles` 为 `^0.1.0`；`engines.node >= 20`；运行时依赖包含 `qrcode` 与 `tslib`。
- `icons` 的 peerDependencies：`@angular/core >=19 <24`；运行时依赖 `tslib`。
- `styles` 未声明 `main`/`module`/`exports`/`types`/`peerDependencies`，属于纯资源包。

### 8.3 对 Angular 22 的兼容性

- peer 范围 `>=19 <24` **覆盖 Angular 22**，安装层面的版本约束匹配。
- 组件包为 **partial compilation**：FESM 中存在 `ɵɵngDeclareComponent`，声明版本为 **19.2.19**，`minVersion` 为 **17.0.0**；消费端 Angular 22 的 linker 会在构建时接管，理论上可跨版本链接。
- `fesm2022` + `index.d.ts` + `types/` 的结构符合现代 APF 的消费方式；但**没有在 Angular 22 下实际构建**，仍需验证 forms、overlay、table、date-picker 等对 CDK 行为的变化。
- 结论：**安装兼容性有依据，运行兼容性待 PoC**，不能仅凭 peer 范围判定“已验证支持 22”。

### 8.4 打包形态与类型声明

- 组件包提供 `fesm2022`、根 `index.d.ts`、`types/*.d.ts` 与各组件 `.d.ts`，并带 source map；`exports` 暴露包根与 `bridge.css/less`。
- **没有按组件的 secondary entry point**（如 `@tdesign-ng/components/button`），所有组件从根入口导出；`sideEffects` 仅标记 Less/CSS，理论上 JS 可 tree-shake，但单一 FESM 约 1.85 MB，实际产物体积需在应用中测量。
- 组件普遍使用 `ViewEncapsulation.None`（统计到 198 处）并通过 `bridge.css` 把 TDesign 上游类名映射到 Angular 宿主元素；这意味着样式是**全局作用域**，业务侧必须遵守 token 与桥接约定，避免全局冲突。
- 类型声明完整可用；但 `qrcode` 仅作为运行时依赖，未在公开类型中暴露，暂未发现消费者需要额外安装 `@types/qrcode` 的证据【待确认】。

### 8.5 SSR 与 zoneless

- **zoneless 证据较强**：组件使用 `ChangeDetectionStrategy.OnPush`（198 处）、signals/effect，未发现 `NgZone` 依赖；与 Angular 22 的 zoneless 方向一致。但包内与 README 均**未声明 zoneless 支持**，仍需用 `provideZonelessChangeDetection` 实测【待确认】。
- **SSR 未声明**：README/文档未说明 SSR；包内统计到 `DOCUMENT` 注入 106 次、`afterNextRender` 18 次、`typeof window` 22 次、`typeof document` 9 次，同时存在直接 `document.*` 79 次、`window.*` 14 次、`getComputedStyle` 5 次。部分访问位于浏览器事件或 `afterNextRender` 中，但仍存在未显式守卫的测量逻辑。
- 判断：**不能据此宣称支持 SSR**。当前建议的 SPA + 预渲染路线受影响较小；若启用 SSR 或预渲染，必须逐组件冒烟（尤其 Affix、Anchor、Textarea、QRCode、DatePicker、Table）。

### 8.6 styles 包：主题与引入方式

- 提供 `index.less`（入口）、`theme.less`（主题变量）、`global.less`、`reset.less`、按组件的 Less，以及 `dist/index.css`、`dist/theme.css`、`dist/components.css`。
- 主题基于 **`--td-*` CSS 变量**；暗色通过 `theme-mode="dark"` 属性切换，**没有自动 `prefers-color-scheme` 适配**（已检查 dist 主题文件）。
- 体积：`dist/index.css` 约 25 KB（min 约 19 KB）；全量 `dist/components.css` 约 531 KB（min 约 468 KB）。建议使用 Less 入口 + 按组件引入，避免全量 CSS。
- 包未声明 `main`/`exports`/`style` 字段，导入依赖 `@import '@tdesign-ng/styles/index.less'` 这类深路径；在 Angular CLI + Less 下通常可解析，但属于**未契约化的资源包**，需在实际构建中验证【待确认】。
- 由于组件使用 `ViewEncapsulation.None`，样式顺序、全局 reset 与业务样式可能互相影响；需要固定引入顺序并避免覆盖组件内部结构。

### 8.7 icons 包：体积与按需引入

- 内置 **65 个图标子集**（生成自 `tdesign-icons-svg`），通过 `TD_ICONS` 记录 + `TIcon` 组件渲染；FESM 约 36 KB。
- **没有按图标的 subpath export**；只要使用 `TIcon`，65 个图标数据会一起进入包体。36 KB 对首版可接受，但距离 TDesign 全量图标集（数百至上千）差距明显。
- 未命中图标名时渲染为空并输出控制台警告，需要业务侧提供兜底。
- 基础题型常用图标大概率可覆盖，但矩阵、排序、文件、评分等扩展 UI 需要逐项核对图标清单【待确认】。若后续要“与主流问卷系统基本一致”，应补齐全量或提供按图标/按需加载方案。

### 8.8 许可证

- 三个包均为 **MIT**，包内 LICENSE 为 MIT 全文（版权声明为 Bytedance 2021）；与本项目 MIT 兼容。
- 建议在 `THIRD_PARTY_NOTICES` 中保留 TDesign 相关版权与来源说明；styles 内含 `tdesign-common` vendor 资源，icons 来源于 `tdesign-icons-svg`。

### 8.9 发布质量与可用性证据

**可核实的优点：**

- README 含安装、样式引入、组件清单与版本策略；在线文档站可用，提供组件示例与 API 属性表，并链接到源码路径。
- 73 个组件覆盖按钮、输入、选择、日期、表格、弹窗、表单等首版所需基础控件；类型声明与 source map 齐全。
- MIT 许可、单一 scope 三个包职责清晰（组件/样式/图标），版本 lockstep（styles peer `^0.1.0`）。

**需要修正的发布质量问题：**

- 仅有一个 0.1.0 公开发布，作者自述为预发布；`latest` 默认安装到预发布版本，且 0.x 允许破坏性变更。
- 未声明 SSR/zoneless 支持，也未提供对应测试证据；包内存在直接 DOM 访问。
- `styles` 包缺少 `main`/`exports`/`style` 等字段，导入路径未契约化。
- 图标仅 65 个子集，且无按图标入口；复杂题型扩展会受限。
- `qrcode` 是硬依赖，所有消费者都会安装，即使不使用 QRCode 组件。
- 没有按组件 secondary entry point，单一 FESM 较大；tree-shaking 效果需实测。
- peer 范围较宽（`>=19 <24`），但没有公开的 Angular 版本测试矩阵；不能把“范围内”当作“已验证”。
- 包内未包含测试/CI 证据（tarball 无法核实）【待确认】。

### 8.10 结论：**有条件采用**

**不建议直接采用**，因为 Angular 22 运行、SSR/zoneless、图标覆盖与样式包契约都还没有可核实的证据；**也不建议放弃**，因为组件覆盖面、API 完整度、文档质量与 MIT 许可都满足项目需要，且问题大多可在接入前修正。

接入前置条件：

1. 在 Angular 22 + pnpm 12 工程中完成真实安装、构建与运行时冒烟（表单、overlay、table、date-picker）。
2. 明确渲染模式：若走 SPA/预渲染，验证预渲染；若要 SSR，逐组件修复/验证 `window`/`document`/`getComputedStyle` 访问。
3. 用 zoneless 配置跑一遍核心页面；未通过前保持 zone-based。
4. **精确锁定 `0.1.0`**，不使用 `^0.1.0` 自动升级；升级前做回归。
5. 确定图标策略：首版接受 65 个子集并做兜底，或先补齐常用集合/按需入口。
6. 固定 styles 引入顺序（reset → theme → components/bridge），验证 Less 深路径解析，处理全局样式冲突。
7. 若暂不使用 QRCode，确认 `qrcode` 是否可通过按需导入避免进入首屏包。

> 首轮 PoC 实测结果见 8.13：条件 1、4、6 已基本满足，条件 3 完成基础验证，条件 2、5、7 仍未闭环。

### 8.11 发布前/接入前建议修正的问题清单（按优先级）

| 优先级 | 问题 | 为什么重要 | 建议 |
|---|---|---|---|
| P0 | Angular 22 未验证 | peer 范围覆盖但无运行证据，CDK/表单行为可能变化 | 增加 Angular 19/20/21/22 构建与冒烟矩阵，至少在 CI 跑 22 |
| P0 | SSR/zoneless 未声明 | 预渲染/SSR 可能因直接 DOM 访问失败；zoneless 是趋势 | 明确支持级别；用 `isPlatformBrowser`/`afterNextRender` 守卫；补 SSR 与 zoneless 冒烟测试 |
| P0 | styles 包无 `main`/`exports`/`style` | 深路径导入未契约化，构建器差异可能导致解析失败 | 增加 `exports`（含 `./index.css`、`./theme.css`、`./*.less`）与文档化的引入路径 |
| P0 | 图标仅 65 个且无按图标入口 | 限制“主流题型”扩展，全部打包不可控 | 发布全量或按图标 secondary entry；提供缺失图标兜底与清单 |
| P0 | `qrcode` 为硬依赖 | 所有消费者安装/打包成本，SSR 下可能触发 canvas/Node 分支 | 改为可选 peer 或懒加载，仅在 QRCode 组件内动态导入 |
| P1 | 单一 FESM、无组件级入口 | 首屏体积不可控，tree-shaking 依赖打包器 | 增加 secondary entry points 或用构建分析证明可按需摇树 |
| P1 | `latest` 指向 0.1.0 预发布 | 默认安装即预发布，0.x 允许破坏性变更 | 在 README/发布说明中明确 0.x 策略；稳定版出现前保持精确锁版本 |
| P1 | 缺少变更记录与兼容矩阵 | 升级风险不可评估，接入方无法判断破坏性变更 | 增加 CHANGELOG、Angular 版本矩阵、迁移说明；发布前跑 a11y/SSR 冒烟 |
| P1 | 全局样式与 bridge 约定 | `ViewEncapsulation.None` 易与业务样式冲突 | 文档化样式顺序、reset 可选化、冲突排查指南 |

### 8.12 题型路线与 UI 影响

| 阶段 | 题型/能力 | 说明 |
|---|---|---|
| 首版 | 单行文本、多行文本、数字、邮箱、日期、单选（radio/下拉）、多选、评分/NPS；必填/长度/范围校验；分页、题目分组；**显示逻辑/跳转逻辑** | 与 D7 一致；TDesign 基础控件可覆盖大部分需求 |
| 后续 | 矩阵单选/多选、排序、文件上传、级联/地址、滑块、签名、计算题 | 需要组合式布局或新增组件；矩阵不阻塞首版 |
| 再后续 | 随机化、管道（piping）、高级配额、第三方集成 | 依赖逻辑与统计引擎成熟度 |

### 8.13 首轮 PoC 实测（2026-11-24）

在 `starply-survey` 骨架中真实接入并验证，环境为 Node 22.23.4、pnpm 12.21.0、Angular 22.3.0、`@tdesign-ng/*` 精确 0.1.0。

| 项目 | 结果 | 说明 |
|---|---|---|
| 安装 | 通过 | `strict-peer-dependencies=true` 下安装成功；`pnpm peers check` 仅报 `@angular/build` 可选 wasm 依赖的 `@emnapi/*` 传递性 peer 不匹配，与 TDesign 无关 |
| 生产构建 | 通过 | `ng build` 成功；initial total 约 290 kB（raw）/ 78 kB（transfer），样式 76.7 kB / 7.05 kB；无预算超限 |
| Less 深路径 | 通过 | `@import '@tdesign-ng/styles/theme.less'`、`reset.less`、`components/{icon,button,input}.less` 均可被 Angular 22 解析 |
| bridge.css | 通过 | 通过 `angular.json` 在业务样式后加载 `node_modules/@tdesign-ng/components/bridge.css` |
| 本地启动 | 通过 | `ng serve` 正常启动；页面渲染出 TDesign 输入框、主/次按钮与图标，控制台无 error/warning |
| zoneless | 基础通过 | 骨架未引入 zone.js，Angular 22 默认 zoneless 下组件可正常渲染；输入/点击等交互未做自动化压力验证【待确认】 |
| SSR | 未验证 | 本轮按 SPA 推进，未启用 SSR/预渲染，8.11 的 SSR 守卫问题仍待处理 |
| 图标覆盖 | 未闭环 | 仅验证 `add` 图标可用，65 个子集是否覆盖首版题型图标清单仍【待确认】 |
| `qrcode` 体积 | 未闭环 | 未使用 QRCode 组件；构建时出现 `qrcode` CommonJS 优化提示，接入前需确认是否进入首屏包 |
| 其他组件 | 未验证 | overlay、table、date-picker、form 校验等尚未冒烟 |

实测暴露的接入注意事项：

1. **构建警告**：`qrcode` 为 CommonJS 依赖，Angular 提示可能影响优化；当前未使用 QRCode，未影响产物。
2. **pnpm 与 Node 版本**：pnpm 12 按 `.nvmrc` 选择 Node，本机未安装 24.22.3，因此骨架以 22.23.4 验证（满足 Angular 22 engines）；文档建议的 Node 24 仍是目标基线。
3. **样式策略**：当前按组件引入 Less，新增 TDesign 组件时需同步补充对应 `components/*.less`，否则组件无样式；这是 0.1.0 无组件级样式入口带来的维护成本。

> 结论：`@tdesign-ng` 可以作为首版 UI 基线，但应按“0.1.0 预发布 + 有条件采用”管理；基础题型与逻辑先行，矩阵等后置，正好把组件库风险控制在可验证范围内。

---

## 9. 版本策略

### 9.1 总体原则

- **锁文件是事实来源**：CI 使用 frozen lockfile；禁止在 CI 中自动升级。
- **统一版本入口**：Angular、NestJS、TypeScript、ESLint 通过 pnpm catalog 管理，升级只改一处。
- **跟随官方支持窗口**：Angular 每个 major 支持约 24 个月；NestJS 无公开 LTS 表，按 major 评估升级。
- **依赖升级走 PR**：用 Renovate/Dependabot 分组升级，Angular 全家桶必须同一 PR。
- **运行时固定**：`packageManager` 固定 pnpm；`.nvmrc`/`engines` 固定 Node 24.x；服务器与本地一致。
- **基础设施版本也纳入版本管理**：非 Docker 部署下，MySQL/Redis/OS 补丁同样需要变更记录与回滚方案。

### 9.2 建议基线

| 项 | 建议 | 说明 |
|---|---|---|
| Node.js | 24.x LTS（当前 24.22.3） | 同时满足 Angular 22 与 NestJS 12；26.x 也可用，但生态验证期更短 |
| pnpm | 12.x（当前 12.23.0） | 使用 Corepack 固定 |
| Angular | 22.x | Active 至 2027-06；下一个 major 发布后评估升级 |
| `@tdesign-ng/components` / `styles` / `icons` | **0.1.0（精确锁定）** | 0.x 预发布，禁止 `^` 自动升级；升级前做回归，详见第 8 节 |
| NestJS | 12.x | 锁定 minor，关注 major 变更 |
| TypeScript | 由 Angular CLI 约束，catalog 统一 | 不单独追新 |
| MySQL | **8.4 LTS** | 8.0 已于 2026-04 EOL，不用于新项目 |
| Redis | **6.2.x（最低线）** | EOL 2027-04-01；升级候选 7.2/7.4 LTS 或 8.2 LTS |
| 开源许可 | MIT | 需补 LICENSE 与第三方声明 |
| 浏览器支持 | 以 Angular 官方支持矩阵为准 | 公开填写页需额外覆盖移动端 WebView |

### 9.3 升级节奏建议

- **Angular**：每个 major 发布后先做依赖升级 PoC，再排期迁移；不要跨两个 major 跳跃。
- **NestJS**：跟随 minor 安全更新；major 升级与 Angular 升级错开，避免同时动两端。
- **MySQL**：在 8.4 LTS 线内打补丁；跨 LTS 升级前做备份与回滚演练。
- **Redis**：
  - 6.2 期间按月跟踪安全公告，至少保持到官方可见的最新 6.2 补丁；
  - 把“升级到 7.2/7.4 LTS 或 8.2 LTS”列入上线后第一季度计划，最迟不晚于 2027-04；
  - 升级前在预发环境验证 BullMQ、限流键、序列化格式、ACL/TLS 配置；
  - 不使用 8.0/8.4 这类 STS 版本作为长期基线。
- **OS/Nginx/Node**：固定版本并纳入补丁窗口；升级前在预发环境跑一遍完整发布与回滚。

### 9.4 MIT 许可的影响

- MIT 宽松、易被采用，适合希望广泛传播的开源项目；需保留版权与许可声明。
- 第三方依赖许可需核查：Angular、NestJS、pnpm 等为 MIT；MySQL 为 GPL（作为独立服务使用）、Redis 8+ 为 AGPLv3/RSALv2/SSPLv1 三选一（作为独立服务使用）。以独立进程方式调用通常不改变本项目 MIT 许可，但**分发镜像/修改 Redis 源码/提供托管服务**时需要法务确认。
- 建议增加 `LICENSE`（MIT）、`THIRD_PARTY_NOTICES` 或在 README 中列出关键依赖与许可。

---

## 10. 主要风险

| # | 风险 | 等级 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | 组件库处于 0.1.0 预发布，API 可能破坏性变更 | 中高 | 升级返工、UI 回归 | 精确锁定 0.1.0；不在业务层依赖非公开 API；推动 CHANGELOG 与兼容矩阵（§8.11） |
| R2 | 组件库未在 Angular 22 实测（peer `>=19 <24`，partial 编译版本 19.2.19） | 中高 | 运行时行为差异、被迫降级 Angular | 接入前在 Angular 22 + pnpm 12 做安装/构建/冒烟 PoC；开启 `strict-peer-dependencies` |
| R3 | 组件库 SSR/zoneless 未声明，存在直接 DOM 访问 | 中 | 预渲染/SSR 报错、hydration 问题 | 先按 SPA（+ 可选预渲染）推进；启用 SSR 前逐组件冒烟；推动 `isPlatformBrowser`/`afterNextRender` 守卫 |
| R3a | icons 仅 65 个且无按图标入口 | 中 | 复杂题型图标缺失、全量打包 | 首版核对图标清单并做兜底；推动全量或按图标入口（§8.11） |
| R3b | styles 包无 `exports`/`main`，组件为全局样式 | 中 | 深路径导入失败、全局样式冲突 | 固定引入顺序并文档化；构建期验证 Less 解析；推动补 `exports` |
| R4 | 问卷 schema 演进导致历史答卷语义漂移 | 中高 | 统计口径错误、无法回放 | 发布版本不可变；答卷绑定 version；迁移脚本显式处理 |
| R5 | ORM 选型反复 | 中 | 返工数据层 | 动工前用 PoC 对比 TypeORM 1.x 与 Prisma 稳定版；锁定一个 |
| R6 | 误用 `latest` 安装到 RC 版本 | 中 | 生产不稳定 | 显式锁定稳定版；CI 校验 lockfile |
| R7 | MySQL 8.0 已 EOL | 高 | 无安全补丁、合规风险 | 新项目直接使用 8.4 LTS；安装源与补丁计划入库 |
| R8 | Redis 6.2 生命周期短 | 高 | 2027-04 后无官方安全补丁 | 锁定 6.2.x；预发验证 7.2/7.4/8.2 LTS；上线后第一季度完成升级 |
| R9 | Redis 6.0/6.1 不满足 BullMQ | 中 | 队列不可用 | 明确版本下限为 6.2；部署脚本校验 `redis-server --version` |
| R10 | 多租户越权/数据串租 | 高 | 数据泄露、信任崩塌 | 统一仓储入口 + 复合索引 + 越权测试 + 审计 |
| R11 | 非 Docker 部署的配置漂移 | 中 | 环境不一致、难回滚 | 固定版本、脚本化部署、版本目录 + 软链接回滚 |
| R12 | 答卷数据规模与统计性能 | 中 | 查询慢、导出超时 | 明确规模预期；索引与异步汇总；压测 |
| R13 | 隐私与合规（PII、匿名、保留期） | 高 | 法律与信任风险 | 数据分级、最小化采集、加密、保留策略、导出审计 |
| R14 | 刷卷/重复提交/恶意流量 | 中 | 数据质量与成本 | 限流、幂等键、唯一约束、验证码/风控按需 |
| R15 | 中英双语内容模型设计不当 | 中低 | 后期加语言需改表 | 翻译存 JSON + 默认语言回退；不写死两列 |
| R16 | 矩阵等后置题型与首版 schema 不兼容 | 中 | 返工题型/答案模型 | 题型用可判别联合 + 版本号；首版就预留 matrix 配置结构 |
| R17 | pnpm 严格依赖与工具链兼容 | 低中 | 局部依赖解析失败 | 骨架阶段验证；必要时局部 `hoisted` |
| R18 | MIT 与第三方许可声明缺失 | 低 | 合规瑕疵 | 添加 LICENSE、第三方声明；Redis 保持独立服务 |

> 已关闭：原“仓库无 LICENSE”风险已由 D1（MIT）决策关闭，剩余动作是添加许可文件，不再是方向性风险。

---

## 11. 决策与待确认事项

### 11.1 已确认（不再作为待定项）

| 编号 | 事项 | 结论 |
|---|---|---|
| D1 | 开源协议 | MIT |
| D2 | 多租户 | **共享库 + `tenant_id`**；面向多家企业，企业内多员工协作 |
| D3 | 部署 | 云服务器直接部署，不使用 Docker |
| D4 | 数据库 | MySQL 8.x（建议 8.4 LTS） |
| D5 | 缓存 | Redis 6.x（必须 6.2+） |
| D6 | 国际化 | 中英双语 |
| D7 | 题型 | 主流功能为目标；**首版包含基础题型 + 显示/跳转逻辑**，矩阵等后置 |
| D8 | 组件库 | 评估结论为**有条件采用** `@tdesign-ng@0.1.0`，前置条件见 §8.10（是否采用由用户最终拍板） |

### 11.2 待确认事项与建议（只建议，不替用户拍板）

> 已关闭：原 Q2（首版题型与逻辑）由 D7 确定（基础题型 + 显示/跳转逻辑，矩阵后置）；原 Q3（多租户隔离）由 D2 确定（共享库 + `tenant_id`）。下表不再重复列出。

| 编号 | 问题 | 选项 | 建议（待确认） | 理由与取舍 |
|---|---|---|---|---|
| Q1 | 组件库接入策略 | A. 直接安装 `@tdesign-ng@0.1.0` 全量采用；B. 有条件采用：先做 Angular 22/SSR/zoneless PoC，满足 §8.10 前置条件后接入；C. 改用其他成熟组件库 | **B** | 组件覆盖面与文档可用，但 0.1.0 为预发布且无 Angular 22 实测证据；PoC 成本远低于返工或误换库（依据见第 8 节） |
| Q4 | 部署拓扑与高可用 | A. 单台云服务器；B. 2 台应用 + Nginx + 独立 MySQL/Redis；C. 多可用区/托管数据库 | **B 作为目标架构，A 作为首发起步** | 非 Docker 下双机 + Nginx 已能实现基本滚动发布；托管 DB 可降低备份/HA 负担 |
| Q5 | 规模与容量目标 | 见 11.3 的 S/M/L 三档 | **按 M 的代码约束设计，按 S 的规模起步** | 避免过早分库分表；无状态 API 与租户维度为后续扩容留路 |
| Q6 | 匿名填写、防重复与反滥用 | A. 全匿名；B. 匿名 + 令牌/指纹去重；C. 强制登录 | **B** | 问卷场景匿名是刚需；用签名 token/ cookie + 唯一索引去重，风险流量再上验证码 |
| Q7 | 附件存储 | A. 服务器本地磁盘；B. 对象存储（S3 兼容）；C. 数据库 BLOB | **B（文件题型后置时再落地）** | 非 Docker 单机本地盘不利于扩容与备份；BLOB 会拖垮数据库；对象存储是标准解 |
| Q8 | Redis 发行版与补丁责任 | A. 自建 Redis 6.2；B. 云托管 Redis 6.2；C. 升级到 7.x/8.2 LTS 或 Valkey | **A/B 可首发，但必须规划 C** | 6.2 EOL 2027-04；自建需自担补丁；托管需确认厂商补丁承诺 |
| Q9 | MySQL 8.x 具体版本 | A. 8.0；B. 8.4 LTS | **B（8.4 LTS）** | 8.0 已于 2026-04 EOL；8.4 仍属 8.x 且为 LTS |
| Q10 | 时区与租户默认语言 | A. 全部按服务器时区；B. 存 UTC + 租户时区；C. 存 UTC + 用户时区 | **B（存 UTC + 租户时区）；语言按用户偏好，缺省用租户默认语言** | 多企业跨时区是常态；租户级默认语言便于成员统一体验 |
| Q11 | 统计口径与实时性 | A. 实时 SQL 聚合；B. 预聚合表 + Redis 缓存；C. 外部数仓 | **B** | 首版数据量可控；预聚合兼顾性能与实现成本；数仓等规模明确后再引入 |
| Q12 | 测试与发布标准 | A. 仅单测；B. 单测 + API 集成 + E2E 冒烟；C. 全套含视觉回归/压测 | **B 为首版门槛，C 逐步补齐** | 非 Docker 发布回滚成本高，至少要有 E2E 冒烟与迁移回滚演练 |
| Q13 | 租户数据生命周期 | A. 不删除；B. 支持导出 + 延迟硬删除；C. 支持按保留期自动清理 | **B，保留期可配置后再到 C** | 多租户企业客户通常要求数据可带走；合规上需要删除能力 |
| Q14 | 租户开通方式 | A. 自助注册；B. 人工开通 + 邮件邀请成员；C. 两者都支持 | **B 首发，后续评估 A** | 面向企业客户，人工开通便于控制租户质量与配额；自助注册涉及验证与滥用防护 |

### 11.3 Q5 专项：容量档位与建议

> 以下数字是**用于讨论的示例假设**，不是实测结论；最终需用压测校准。

| 档位 | 应用部署 | MySQL | Redis | 假设规模（示例） | 代价/限制 |
|---|---|---|---|---|---|
| S 起步 | 1–2 台应用（2–4 vCPU） | 单实例 8.4 LTS | 单实例 6.2.x | < 50 并发填写；单问卷 < 5 万答卷；月新增 < 20 万 | 成本低；无真正 HA，故障需人工恢复 |
| M 成长 | 2+ 台应用 + Nginx | 主从/托管 8.4 LTS | 主从/托管 6.2.x | 50–300 并发；单问卷 5–50 万；月新增 20–200 万 | 需要异步导出、队列与更完整的监控 |
| L 规模 | 多台应用 + 负载均衡 | 读写分离/分区，必要时分库 | Redis Cluster 或托管集群 | > 300 并发；月新增 > 200 万 | 运维与一致性复杂度显著上升 |

**建议**：

- **代码按 M 的约束设计**：API 无状态、租户上下文显式传递、导出/统计异步化、幂等与唯一约束齐全、缓存 key 带租户与版本。这样从 S 扩到 M 主要是加机器与调参，而不是改架构。
- **部署按 S 起步**：先用 2 台应用 + Nginx（可先 1 台）验证产品；MySQL/Redis 优先选云托管以降低备份与故障处理成本【待确认是否允许托管】。
- **用指标触发扩容**，而不是提前分库分表：API p95、错误率、MySQL CPU/连接数/慢查询、Redis 内存与淘汰、队列积压、磁盘水位。达到阈值再进入 M/L。
- **不建议首版做分库分表或 Redis Cluster**：多租户 + 非 Docker 的运维能力还没建立，过早分布式化会放大故障面。

### 11.4 Redis 6.x 结论（摘要）

- **可行**：功能上满足缓存、限流、Lua、Streams、BullMQ；但版本必须 ≥ **6.2**。
- **不建议长期使用**：官方 EOL 为 **2027-04-01**，距当前约 4 个月；之后无官方安全补丁。
- **必须留余量**：首发可用 6.2，但上线后第一季度应完成到 **7.2/7.4 LTS（EOL 2029-12）或 8.2 LTS（EOL 2030-09）** 的升级验证；避免 8.0/8.4 这类 STS 版本。
- **补丁责任**：自建需按月跟踪 CVE；托管需确认厂商对 6.2 的补丁承诺与升级窗口。

### 11.5 MySQL 8.x 结论（摘要）

- 用户约束为 8.x，**建议直接采用 8.4 LTS**；8.0 已于 2026-04 EOL，不建议新项目使用。
- 8.4 满足 JSON、生成列、复合索引、CTE、窗口函数等需求；安装源、认证插件与驱动兼容需在目标环境验证。

### 11.6 MIT 后续动作

- 添加根目录 `LICENSE`（MIT 全文，含年份与版权人）。
- 增加第三方许可清单或在 README 中说明关键依赖许可。
- Redis/MySQL 以独立服务方式使用；若未来分发包含它们的镜像或修改源码，需要重新评估 AGPL/GPL 义务。

---

## 12. 关键阻塞点判断

**没有硬性技术阻塞。** 但有四个“必须先处理，否则会返工或带病上线”的点：

1. **版本生命周期**：MySQL 应选 8.4 LTS（8.0 已 EOL，待确认）；Redis 必须 6.2+ 且需在 2027-04 前升级。这不是架构阻塞，而是上线时间与运维计划阻塞。
2. **多租户隔离落地**（D2 已定共享库 + `tenant_id`）：方案不再待定，但隔离实现决定所有表结构、索引、缓存键、队列任务与权限校验；必须用统一仓储入口 + 复合索引 + 越权测试保证正确性。
3. **显示/跳转逻辑规则细化**（D7 已定进首版）：逻辑引擎的 schema、版本化存储、前后端共用校验需在设计阶段定清；矩阵等题型通过可判别联合预留，不阻塞首版。
4. **组件库 0.1.0 接入验证**（Q1）：需验证 Angular 22 构建、SSR/zoneless、图标覆盖与 styles 引入；结论为有条件采用，可用适配层隔离风险。

如果上述事项暂时无法全部确认，建议以“共享库 + `tenant_id`、基础题型 + 显示/跳转逻辑、MySQL 8.4、Redis 6.2、单机/双机非 Docker、`@tdesign-ng@0.1.0` 有条件采用”为最小假设推进骨架，并在 ADR 中显式记录假设。

---

## 13. 建议的下一步（不含业务代码）

1. **补齐许可**：添加 MIT `LICENSE` 与第三方许可说明。
2. **写 ADR**：多租户隔离与路由（D2 已定共享库 + `tenant_id`，记录实现约束）、显示/跳转逻辑规则（D7 已定范围，记录规则 schema 与版本化方案）、部署拓扑（Q4）、容量档位（Q5）、组件库接入决策（Q1/D8）。
3. **确定基础设施版本**：MySQL 8.4 LTS 安装源与补丁计划；Redis 6.2.x 部署方式与升级路径。
4. **搭骨架**：pnpm workspace、`apps/web`、`apps/api`、`packages/contracts`、`packages/questionnaire-core`；catalog、Node 24、CI、lint、测试。
5. **非 Docker 运维基线**：systemd unit、Nginx/TLS、发布目录与回滚脚本、MySQL/Redis 备份与恢复演练、日志轮转、监控告警。
6. **PoC 验证**：
   - Angular 22 + pnpm 12 的安装、构建、预渲染；
   - NestJS 12 + 选定 ORM 的连接、迁移、JSON 查询；
   - 多租户 Guard + 仓储隔离 + 越权测试；
   - Redis 6.2 上的缓存、限流、BullMQ 闭环；
   - 实际安装 `@tdesign-ng@0.1.0`（`components`/`styles`/`icons`），在 Angular 22 + pnpm 12 下完成构建、默认 SPA 运行、zoneless 与预渲染冒烟，并测量产物体积。
7. **组件库检查点**：把 §8.11 的 P0/P1 问题清单同步给组件库作者（即用户），明确 Angular 22 支持与 SSR/zoneless 声明；在稳定版或修正版发布前保持 0.1.0 精确锁定。

---

## 14. 参考信息源

- Angular Releases & Support Policy：<https://angular.dev/reference/releases>（查询于 2026-11-24；v22 Active 至 2027-06，LTS 至 2028-06）
- Angular v22 Release：<https://angular.dev/events/v22>（Signal Forms、Angular Aria 等已稳定）
- Node.js Previous Releases：<https://nodejs.org/en/about/previous-releases>（v24.22.3 LTS、v26.13.1 LTS）
- pnpm Catalogs：<https://pnpm.io/catalogs>
- NestJS Support 页面：<https://docs.nestjs.com/support>（未提供公开 LTS 时间表）
- BullMQ Introduction：<https://docs.bullmq.io/guide/introduction>（Redis 6.2+）
- Redis 产品生命周期：<https://redis.io/docs/latest/operate/rs/installing-upgrading/product-lifecycle/>（Redis 6.2 LTS，EOL 2027-04-01；7.2/7.4 LTS EOL 2029-12-01；8.2 LTS EOL 2030-09-01）
- Redis Licenses：<https://redis.io/legal/licenses/>（Redis 8 起 RSALv2 / SSPLv1 / AGPLv3 三选一）
- MySQL EOL 公告：<https://www.mysql.com/support/eol-notice.html>（MySQL 8.0 于 2026-04-21 进入 Sustaining Support）
- npm registry 查询：`@angular/core`、`@nestjs/core`、`typeorm`、`prisma`、`mysql2`、`ioredis`、`bullmq`、`pnpm` 等 `dist-tags` / `engines` / `peerDependencies`（2026-11-24）
- 组件库 npm 包页：<https://www.npmjs.com/package/@tdesign-ng/components>、<https://www.npmjs.com/package/@tdesign-ng/styles>、<https://www.npmjs.com/package/@tdesign-ng/icons>（0.1.0，2026-11-24 发布，MIT）
- 组件库在线文档：<https://yuanyong129.github.io/tdesign-ng/>（组件示例与 API 属性表）
- 组件库 tarball 核查：`@tdesign-ng/{components,styles,icons}@0.1.0` 解压检查 `package.json`、`fesm2022`、`.d.ts`、Less/CSS、图标资源
