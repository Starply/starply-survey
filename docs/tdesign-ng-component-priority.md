# tdesign-ng 组件现状与改造优先级

> 更新时间：2026-11-28。依据：npm 实际安装的 `@tdesign-ng/*@0.2.0`、本地真实运行结果，以及改造中的实际用法；不按官方文档假设组件行为。
> 参考项目（仅浏览功能与布局，不做任何写操作）。整体只采用「顶部菜单 + 下方内容」的上下布局，不引入左侧导航。

## 1. 依赖与安装状态

| 项目 | 状态 |
| --- | --- |
| 版本 | catalog 已升级到 npm 最新发布版 `0.2.0`，`components` / `icons` / `styles` 三包版本一致 |
| 安装方式 | `pnpm install --no-frozen-lockfile` 从 registry 安装成功 |
| 本地路径 / link | 已检查 `package.json`、`apps/web/package.json`、`pnpm-workspace.yaml`、`.npmrc`，不存在 `link:` / `file:` 引用 |
| 组件入口 | `@tdesign-ng/components@0.2.0` 的 `index.d.ts` 包含 Table、Pagination、Dialog、Select、Tabs、Card、Form 等完整入口 |
| 构建 | `pnpm build` 通过；新增 TCard / TTabs 等共享组件后 initial bundle 约 927kB，对应把 warning 预算从 900kB 调到 1MB（error 仍为 1.5MB） |
| 安装告警 | `pnpm peers check` 有既有告警，与 tdesign-ng 无关：`typeorm` 期望 `ioredis ^5.0.4`（当前 6.1.0）；`@napi-rs/wasm-runtime` 期望 `@emnapi/*` 的 beta 版本（当前 alpha.6） |

0.2.0 已修复 0.1.1 中 `TCard` 内容投影不渲染的问题；本轮已把列表、统计、收集、原始数据页的容器切换回 `TCard`，运行正常。

## 2. 当前改造采用的组件

| 组件 | 页面 | 实际用法 | 运行结果 |
| --- | --- | --- | --- |
| `TTable` | 问卷列表、题库列表、原始数据 | `data`、`columns`、`rowKey`、`loading`、`empty`、`pagination`、`(pageChange)`、`tTableCell` 单元格模板 | 正常渲染表头、数据、分页 |
| `TSelect` | 问卷状态筛选、题库题型筛选 | `[options]`、`[value]`、`(valueChange)` | 正常展开与选择 |
| `TDialog` | 新建问卷、答卷详情 | `visible`、`confirmLoading`、`confirmBtn`、`(confirm)`、`(visibleChange)` | 正常弹出；确认按钮不会自动关闭，由页面控制 |
| `TButton` | 全局 | `theme`、`variant`、`size`、`loading`、`disabled` | 正常 |
| `TInput` | 搜索、表单 | `value`、`(valueChange)`、`placeholder` | 正常 |
| `TTag` | 状态、标签 | `theme`、`variant`、`size` | 正常 |
| `TMessageService` | 全局提示 | `success`、`warning`、`error` | 正常 |
| `TMenu` | 顶部外壳主导航 | `mode="horizontal"`、`theme="light"`、`[value]`、`(valueChange)`、`<t-menu-item>` 内容投影 | 正常渲染并切换选中态；未内置 RouterLink，需页面用 `Router.navigate` + `NavigationEnd` 同步 |
| `TCard` | 列表筛选/表格容器、统计概览、收集与数据页 | `bordered` + 内容投影 + `bodyStyle` 控制内边距 | 0.2.0 下正常渲染投影内容 |
| `TTabs` | 单份问卷上下文页签 | `[list]` 数据驱动、`[value]`、`(change)`，值变化后 `Router.navigate` | 正常显示 4 个页签、切换后高亮当前页 |
| `TPopconfirm` | 问卷/题库删除 | `theme="danger"`、`[content]`、`[confirmBtn]`、`(confirm)`，触发器外包 `<span>` | 正常弹出、取消不删除 |
| `TEmpty` | 统计页题目空状态 | `description` | 正常显示插画与说明 |
| `TQRCode` | 答卷收集页 | `[value]`、`[size]` | 正常生成二维码 |

样式方面按组件单独引入 `@tdesign-ng/styles/components/*.less`，当前已加入 table、pagination、dialog、select、popup、loading、empty、card、tabs、menu、qrcode，未整包引入。

## 3. 页面与组件映射

| 页面 | 已用组件 | 后续需要 |
| --- | --- | --- |
| 顶部外壳 `TenantShell` | Menu（主导航）、Button、Tag | Dropdown / Avatar（账号菜单、租户切换） |
| 问卷列表 | Card、Table、Pagination（Table 内置）、Select、Input、Dialog、Popconfirm、Button、Tag、Message | 日期组件（时间筛选） |
| 题库列表 | Card、Table、Pagination、Select、Input、Popconfirm、Button、Tag、Message | 批量操作（Checkbox/Table 选择列） |
| 问卷编辑器 | Button、Input、Textarea、Tag、Message | Tabs（大纲/设置）、InputNumber（评分）、Upload（上传题）、DatePicker（日期题）、Tree/List（题目大纲）、Drawer（移动端设置） |
| 题库编辑页 | Button、Input、Textarea、Message | InputNumber、TagInput、Tabs |
| 登录 / 公开填写 | Input、Button、Message | Form 校验、Radio / Checkbox 题型组件（当前公开页为原生控件） |
| 数据统计 | Tabs、Card、Empty、ECharts（选择题/评分题分布，按需动态加载） | Statistic |
| 答卷收集 | Tabs、Card、QRCode、Button、Message | — |
| 原始数据 | Tabs、Card、Table、Button、Dialog | DateRangePicker、Input、Checkbox、Popconfirm |

## 4. 发现的问题与优先清单

### P0：阻塞当前页面

1. **TTable 缺少内置序号列**
   - 页面：问卷/题库列表、原始数据的「序号」列。
   - 现状：没有 `type: 'index'` 列类型，只能用 `tTableCell` 模板读取 `rowIndex` 自行加 1。
   - 建议：增加 `type: 'index'`（或 `colKey: '__INDEX__'`）列，支持分页后的连续序号。

2. **TTable 操作列需要完全自写**
   - 现状：操作按钮需用单元格模板 + 自定义样式；没有行操作列预设。
   - 建议：提供行操作列插槽/示例，减少每个列表页重复样板。

### P1：中后台下一批页面需要

3. **TDropdown**：顶部账号菜单（个人中心、退出）、租户切换；主导航已改用 `TMenu`，账号区仍需 Dropdown / Avatar。
4. **TForm 校验**：邀请成员、个人资料、改密等表单需要统一的必填/长度/错误展示；当前表单是手写校验。
5. **TInputNumber**：题库评分范围、数字题 min/max 配置；当前用普通 Input 解析数字。
6. **TAvatar / TBadge**：顶部账号区、成员列表。
7. **TTable 行选择列**：成员批量操作、题库批量删除；类型定义已有 `single/multiple`，尚未验证完整样式。
8. **TStatistic**：数据统计页的数值概览；当前概览卡是 TCard 内的自定义文本。
9. **TDateRangePicker**：原始数据的按时间筛选。

### P2：问卷编辑器对齐参考项目需要

10. **TUpload**：上传题。
11. **TDatePicker**：日期题与问卷时间筛选。
12. **TTree / TList + 拖拽排序**：题目大纲和题型面板排序。
13. **TDrawer**：窄屏下的题目设置面板。
14. **TTagInput**：题库标签输入（当前是逗号分隔文本）。
15. **TTransfer / TCheckbox / TRadio**：复杂题型配置与公开填写页。

## 5. 当前实现取舍

- 参考项目只借鉴「搜索栏 + 标题/新建按钮 + 表格 + 分页 + 操作」的信息结构，以及编辑器的顶部工具栏思路。
- 不引入参考项目的左侧菜单和 Element Plus 视觉；整体保持顶部菜单、下方内容。
- 参考站点只做只读浏览。此前在收到“不要新增/修改数据”的提醒前，曾为查看编辑器布局创建过一份名为「测试问卷」的临时问卷；收到提醒后未再执行任何写操作，该问卷也未再改动。
- 0.2.0 升级后优先把 Card、Tabs、Popconfirm、Empty 落到真实页面并逐页验证；剩余组件按上表顺序继续替换。
