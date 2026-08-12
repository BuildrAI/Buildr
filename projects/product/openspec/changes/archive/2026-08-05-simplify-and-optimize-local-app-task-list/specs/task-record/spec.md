## MODIFIED Requirements

### Requirement: Local App 必须展示并适当管理 Task Record
Buildr Local App MUST 在已登记 Workspace 下提供 Task 核心导航、SQLite 轻量列表和详情，并 MUST 允许人通过 Task Record Application 编辑 active Task 以及明确完成或放弃 Task。Local App MUST NOT 提供正式 Task 创建入口；正式 Task 只由 Agent 通过 Task Manager/Application 创建。Task 概览 MUST NOT 从 Environment、worktree、branch、OpenSpec currentness、Review、Verification、Finish、Board 或 Retrospective 推断 lifecycle。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks`
- **THEN** 页面 MUST 从 SQLite authority 的轻量 query projection 列出匹配过滤条件的 Task ID、title、intent、Project/Service scope、stored Change references、status、直接 Child 数量、terminal result 摘要和 `updatedAt`
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
- **WHEN** collection GET 使用 `q`、`project`、`service`、`status` 或 `hasChildren`
- **THEN** HTTP interface MUST 规范化封闭 filter input 并调用 Task Record Application query projection
- **AND** `status` MUST 只接受 `active|completed|abandoned|all`，`hasChildren` MUST 只接受 `yes|no|all`，`service` MUST 使用 `project/service`

#### Scenario: Task API 提交路径或越界字段
- **WHEN** Task query/body 包含 `target`、`root`、`path`、未知 query、完整 next-state document、专业记录字段或其他未知字段
- **THEN** HTTP interface MUST 在读取或修改 Task Record 前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或任意其他 Workspace

#### Scenario: Task API 写请求不可信
- **WHEN** 保留的 mutation 缺少合法 Origin/session、不是允许的 JSON content type、超过 body limit 或 action fields 不完整
- **THEN** HTTP interface MUST 拒绝请求并保持 Task Record 不变
- **AND** MUST 返回现有 Local App error envelope 可表达的稳定诊断

## ADDED Requirements

### Requirement: Local App Task query projection 必须保持轻量且来自唯一 authority
Task Record Application MUST 为 Local App 提供 stored-state query projection，并 MUST 只从 canonical Workspace SQLite Task authority 读取持久字段和直接关系。Projection MUST NOT 读取 filesystem registry 或调用 Environment、Git、OpenSpec Change resolver、Development、Review、Verification、Finish reader。

#### Scenario: 批量读取 Task 列表
- **WHEN** Workspace 包含数百个 Task 且 Local App 请求列表
- **THEN** repository MUST 通过不随 Task 数量线性增加的有限批量参数化查询组合 Task、scope、stored Change references 与直接关系摘要
- **AND** MUST NOT 对每个 Task 重复打开数据库或执行逐 Task relation query

#### Scenario: 返回 stored Change reference
- **WHEN** 轻量列表或详情包含一个已保存 `project/change` reference
- **THEN** projection MUST 保留该引用并允许 Local App 构造具体 Change 链接
- **AND** MUST NOT 声称该引用当前 available、active、archived 或来自 matching Task Environment

#### Scenario: 进入具体 Change 页面
- **WHEN** 用户点击某个 stored Change reference
- **THEN** 具体 Change route MUST 继续调用 Task-scoped Change resolver，实时解析 matching Task Environment candidate 与 retained active/archive facts
- **AND** 当前不可用时 MUST 返回现有 fail-closed diagnostic

### Requirement: Local App Task 列表必须支持封闭 SQLite 过滤
Task query projection MUST 支持关键词、Project、Service、status 与是否有直接 Child 的参数化过滤。关键词 MUST 对 title 与 intent 使用 OR，与其他条件使用 AND；空白关键词 MUST 等同未过滤，SQL wildcard 与注入输入 MUST 按普通文本安全处理。

#### Scenario: 组合过滤
- **WHEN** 调用方同时提供关键词、Project、Service、status 与 hasChildren
- **THEN** repository MUST 使用参数绑定按 AND 组合不同过滤维度，并在 title/intent 之间使用 OR
- **AND** 返回结果 MUST 只包含同时满足条件的 Task

#### Scenario: Local App 默认 active
- **WHEN** 用户首次进入 Task 列表且未在页面选择其他状态
- **THEN** Web feature MUST 显式请求 `status=active`
- **AND** Application/repository 在未传 status 时 MUST 保持返回全部 Task 的兼容语义

#### Scenario: Project 与 Service 选项
- **WHEN** 页面生成 Project/Service 下拉选项
- **THEN** Application MUST 从 Task SQLite scope rows 读取 distinct identities，选择 Project 后页面 MUST 只展示该 Project 的 Service
- **AND** MUST NOT 为过滤选项读取 Project/Service filesystem registry

#### Scenario: 搜索请求发生竞态
- **WHEN** debounce 后的新查询在旧查询完成前发出
- **THEN** 页面 MUST 显示明确 loading，并 MUST 防止旧响应覆盖新条件结果
- **AND** 空结果 MUST 区分 Workspace 没有 Task 与当前筛选无结果

### Requirement: 直接 Child 数量必须是非持久化查询派生事实
Local App query projection MUST 将 `childTaskCount` 定义为当前 Task 的直接 Child 数量，并 MUST 从 `tasks.parent_task_id` 关系查询派生。该字段 MUST NOT 进入 `buildr.task-record/v1` closed schema、SQLite column、record digest 或 create/update input。

#### Scenario: 统计直接 Child
- **WHEN** Task 具有直接 Child 和更深层后代
- **THEN** `childTaskCount` MUST 只统计直接 Child，且 Child completed 或 abandoned 后数量 MUST 保持不变
- **AND** 递归后代 MUST NOT 进入该数量

#### Scenario: 按是否有 Child 过滤
- **WHEN** `hasChildren=yes` 或 `hasChildren=no`
- **THEN** repository MUST 根据 indexed `parent_task_id` 关系分别筛选至少一个直接 Child或没有直接 Child的 Task
- **AND** MUST NOT 依赖持久化计数、缓存、递归闭包或 filesystem scan

### Requirement: Parent 候选必须按需读取
Local App Task 详情 MUST 在用户操作 Parent 字段前避免读取完整 Task 列表。Parent 候选 MUST 通过 active Task query projection 延迟加载，最终 Parent 合法性仍 MUST 由现有 Task Record Application mutation validation 决定。

#### Scenario: 打开详情首屏
- **WHEN** 用户只查看 Task 概览而未操作 Parent 字段
- **THEN** 页面 MUST NOT 请求 Task collection 作为 Parent 候选来源
- **AND** 当前 Parent 摘要 MUST 从单 Task query projection 展示

#### Scenario: 操作 Parent 字段
- **WHEN** 用户第一次 focus 或展开 Parent selector
- **THEN** 页面 MUST 请求 active Task query projection，并排除当前 Task
- **AND** 当前 Parent 已终态时页面 MUST 仍保留其只读当前选项，后端 MUST 继续拒绝不合法的新关系或循环
