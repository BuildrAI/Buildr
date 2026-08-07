## MODIFIED Requirements

### Requirement: Local App 必须展示并适当管理 Task Record
Buildr Local App MUST 在已登记 Workspace 下提供 Task 核心导航、SQLite 轻量列表和详情，并 MUST 允许人通过 Task Record Application 编辑 active Task 以及明确完成或放弃 Task。Local App MUST NOT 提供正式 Task 创建入口；正式 Task 只由 Agent 通过 Task Manager/Application 创建。Task 概览 MUST NOT 从 Environment、worktree、branch、OpenSpec currentness、Review、Verification、Finish、Board 或 Retrospective 推断 lifecycle。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks`
- **THEN** 页面 MUST 从 SQLite authority 的轻量 query projection 列出匹配过滤条件的 Task ID、title、intent、Project/Service scope、stored Change references、status、直接 Child 数量、terminal result 摘要和 `updatedAt`
- **AND** MUST 支持按复盘 current row 是否存在筛选任务
- **AND** MUST NOT 为列表调用 Environment、Git、OpenSpec Change resolution、Development、Review、Verification 或 Finish reader

#### Scenario: 查看 Task 详情
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks/:taskId`
- **THEN** Task 概览 MUST 只读取该 Task 的 current stored record、Parent/Child 摘要、stored references、派生 `childTaskCount` 与 response-level digest
- **AND** MUST NOT 阻塞读取完整 Task 列表或任何专业 currentness

#### Scenario: 查看 Task Environment
- **WHEN** 用户选择 Task 详情的“环境”页签
- **THEN** 页面 MUST 只读展示 Task Environment Application 返回的当前机器 read model，并与 Task Record 概览分开
- **AND** MUST NOT 提供 prepare/cleanup/resource mutation、直接 receipt 编辑或把 Environment 状态复制到 Task Record

#### Scenario: 从 Local App 创建或编辑 Task
- **WHEN** 用户编辑 active Task 的 title、intent、Parent、scope 或 Change references
- **THEN** HTTP interface MUST 调用 update Application action 并返回最新 record
- **AND** 页面 MUST 使用与 CLI 相同的 identity、reference、closed schema、digest conflict 与 state validation

#### Scenario: Local App 尝试创建 Task
- **WHEN** 用户或客户端尝试从 Local App 页面或 Workspace-scoped Task collection POST route 创建正式 Task
- **THEN** 页面 MUST 不存在创建按钮和表单，HTTP interface MUST 将该 route 视为不存在或不支持
- **AND** Task Record Domain/Application、CLI 与 Task Manager Skill 的 create 能力 MUST 保持可用

#### Scenario: 从 Local App 完成或放弃 Task
- **WHEN** 用户对 active Task 选择完成或放弃
- **THEN** 页面 MUST 要求明确确认并提交非空 summary/reason；完成时 MUST 让用户明确选择是否为 no-change
- **AND** 确认文案 MUST 说明该动作只更新 Task 顶层状态，不执行 Finish、Git、Verification、Environment cleanup 或其他专业动作

#### Scenario: Local App 打开 terminal Task
- **WHEN** Task status 已是 completed 或 abandoned
- **THEN** 页面 MUST 将顶层业务字段和终态动作显示为只读/不可用
- **AND** Environment 页签 MAY 继续只读展示最终 cleanup 或 unavailable 事实，且 MUST NOT 提供重开、修改或绕过 Application validator 的入口

### Requirement: Local App Task API 必须保持 Workspace 写安全边界
Buildr MUST 在 `/api/v1/workspaces/:workspaceId/tasks` 及 Task identity 子路径提供 Workspace-scoped read/limited-write API，并 MUST 在调用 Task Record Application 前解析已登记 Workspace 的真实 canonical root。Task collection GET MUST 只接受封闭 query schema；所有保留的 mutation MUST 复用现有同源、session、JSON、body size、字段白名单和未知字段拒绝边界。Task collection POST MUST NOT 存在。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** 请求中的 `workspaceId` 已登记、可用且与 canonical Workspace identity 一致
- **THEN** HTTP interface MUST 只把该 Workspace 的真实 root 与明确 action/filter input 交给 Application
- **AND** 结果 MUST NOT 混入其他 Workspace 的 Task 或路径

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET 使用 `q`、`project`、`service`、`status`、`hasChildren` 或 `hasRetrospective`
- **THEN** HTTP interface MUST 规范化封闭 filter input 并调用 Task Record Application query projection
- **AND** `status` MUST 只接受 `active|completed|abandoned|all`，`hasChildren` MUST 只接受 `yes|no|all`，`hasRetrospective` MUST 只接受 `yes|no|all`，`service` MUST 使用 `project/service`
- **AND** `hasRetrospective=yes` MUST 只返回存在 `task_retrospective_current` current row 的 Task，`hasRetrospective=no` MUST 只返回不存在该 row 的 Task

#### Scenario: Task API 提交路径或越界字段
- **WHEN** Task query/body 包含 `target`、`root`、`path`、未知 query、完整 next-state document、专业记录字段或其他未知字段
- **THEN** HTTP interface MUST 在读取或修改 Task Record 前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或任意其他 Workspace

#### Scenario: Task API 写请求不可信
- **WHEN** 保留的 mutation 缺少合法 Origin/session、不是允许的 JSON content type、超过 body limit 或 action fields 不完整
- **THEN** HTTP interface MUST 拒绝请求并保持 Task Record 不变
- **AND** MUST 返回现有 Local App error envelope 可表达的稳定诊断
