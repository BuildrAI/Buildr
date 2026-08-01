## ADDED Requirements

### Requirement: Local App Task Environment API 必须保持 Workspace 读取安全边界
Buildr MUST 为 Task 详情提供 Workspace-scoped、只读的 Environment API，并 MUST 在调用 Task Environment Application `inspect` 前解析已登记 Workspace 与真实 Task ID。HTTP interface 与 Web feature MUST NOT 接收 `target/root/path`、直接读取 Environment Receipt/provider evidence 或自行判断 `ready / blocked / cleanup`。

#### Scenario: 打开 Environment 页签
- **WHEN** 用户打开 `/workspaces/:workspaceId/tasks/:taskId` 的“环境”页签
- **THEN** Local App MUST 通过类似 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/environment` 的路径调用 Application `inspect`
- **AND** 响应 MUST 使用 no-store 语义并返回 current-machine source、`observedAt`、receipt availability、status、scopes/roots、Runtime/CLI/依赖/projection、provider evidence、resources 与 cleanup 摘要

#### Scenario: Environment 暂不可用
- **WHEN** Task 尚无 Receipt、当前机器没有对应环境、probe 发现 drift 或 Application 返回 blocked
- **THEN** 页面 MUST 显示明确 unavailable/no-receipt/drift/blocked 状态、观察时间与 next action
- **AND** MUST NOT 隐藏 Task Record、伪造 ready 或从 branch/worktree 名猜环境

#### Scenario: 刷新当前环境事实
- **WHEN** 用户打开页签、页面重新获得焦点或手动刷新
- **THEN** 页面 MUST 发起一次有界只读 probe 并以新的 `observedAt` 替换旧展示
- **AND** P0.2 MUST NOT 增加 WebSocket、后台持续订阅、全量高频轮询或 Environment mutation 按钮

#### Scenario: Environment API 请求路径输入
- **WHEN** 请求携带 `target`、`root`、`path`、receipt bytes 或其他未登记 filesystem input
- **THEN** HTTP interface MUST 在访问文件系统前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或其他 Workspace/Task

## MODIFIED Requirements

### Requirement: Local App 必须展示并适当管理 Task Record
Buildr Local App MUST 在已登记 Workspace 下提供 Task 核心导航、列表和详情，并 MUST 允许人通过 Task Record Application 创建 Task、编辑 active Task 以及明确完成或放弃 Task。P0.1 Task 概览 MUST NOT 从尚未交付的专业记录推断 lifecycle；P0.2 MUST 在同一 Task 详情中以独立只读“环境”页签组合 Task Environment read model，而不得把环境字段或专业状态写入 Task Record。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks`
- **THEN** 页面 MUST 从当前已登记 Workspace 列出真实 Task ID、title、intent、Project/Service scope、status 和 `updatedAt`
- **AND** 空集合、损坏记录和不可用 Workspace MUST 分别显示可解释状态，不得虚构或静默跳过损坏 Task

#### Scenario: 查看 Task 详情
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks/:taskId`
- **THEN** Task 概览 MUST 展示该 Task 的完整最小 Task Record 与 terminal result（如有）
- **AND** MUST NOT 从 Environment、worktree、branch、Review、Verification、Finish、Board 或 Retrospective 推断或改写 Task 顶层状态

#### Scenario: 查看 Task Environment
- **WHEN** 用户选择 Task 详情的“环境”页签
- **THEN** 页面 MUST 只读展示 Task Environment Application 返回的当前机器 read model，并与 Task Record 概览分开
- **AND** MUST NOT 提供 prepare/cleanup/resource mutation、直接 receipt 编辑或把 Environment 状态复制到 Task Record

#### Scenario: 从 Local App 创建或编辑 Task
- **WHEN** 用户提交合法 Task ID、title、intent、scope 与 Change references，或编辑 active Task 的这些字段
- **THEN** HTTP interface MUST 调用对应 create/update Application action 并返回最新 record
- **AND** 页面 MUST 使用与 CLI 相同的 identity、reference、closed schema 与 state validation

#### Scenario: 从 Local App 完成或放弃 Task
- **WHEN** 用户对 active Task 选择完成或放弃
- **THEN** 页面 MUST 要求明确确认并提交非空 summary/reason；完成时 MUST 让用户明确选择是否为 no-change
- **AND** 确认文案 MUST 说明该动作只更新 Task 顶层状态，不执行 Finish、Git、Verification、Environment cleanup 或其他专业动作

#### Scenario: Local App 打开 terminal Task
- **WHEN** Task status 已是 completed 或 abandoned
- **THEN** 页面 MUST 将顶层业务字段和终态动作显示为只读/不可用
- **AND** Environment 页签 MAY 继续只读展示最终 cleanup 或 unavailable 事实，但 MUST NOT 提供重开、修改或绕过 Application validator 的入口

### Requirement: Change 引用必须在当前记录内可解析且无重复
Task Record MUST 使用 `{project, change}` 限定 OpenSpec Change，并 MUST 继续作为该逻辑关联的唯一可移植 owner。Application MUST 在新增引用时通过共享任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），以 canonical Workspace、Task ID 与限定引用确认任务环境或 retained Project 中的 active/archived Change 当前可解析；MUST 只在当前记录内去重。Task Record MUST NOT 保存 Environment identity、checkout path、branch 或 provenance，Application MUST NOT 直接读取 Environment Receipt。

#### Scenario: Task 没有关联 Change
- **WHEN** 正式 Task 不需要 OpenSpec Change，或 Change 尚未创建
- **THEN** writer MUST 接受空 `changes` 集合
- **AND** MUST NOT 创建、推断或选择虚假 Change

#### Scenario: 同一 Task 关联多个 Change
- **WHEN** 一个 Task 关联一个或多个 Project 中的多个真实 Change
- **THEN** writer MUST 保存去重后的 `0..N` 个 `project/change` 引用
- **AND** 跨 Project 同名 Change MUST 通过 Project code 无歧义区分

#### Scenario: 新 Change 只存在于任务环境
- **WHEN** 调用方新增 `project/change` 引用，且 Change 只存在于 matching Task Environment 的 Project 执行根
- **THEN** Resolver MUST 将其识别为可解析的 `task-environment candidate`，Application MUST 接受该逻辑引用
- **AND** MUST NOT 要求先把 Change 写入 retained Project，也 MUST NOT 将执行根路径保存到 Task Record

#### Scenario: 当前记录重复引用
- **WHEN** create/update 尝试在同一 Task Record 中加入重复 `project/change`
- **THEN** Application MUST 返回稳定的 aligned/no-op 或 duplicate diagnostic
- **AND** MUST NOT 保存重复条目

#### Scenario: 其他 Task 引用相同 Change
- **WHEN** Workspace 中另一 Task Record 也引用相同 `project/change`
- **THEN** P0.2 MUST NOT 扫描其他记录或声明跨 Task ownership 冲突
- **AND** 当前操作 MUST 只依据当前记录、当前 Task-scoped resolution 和真实 Project/Change identity

#### Scenario: 既有 Change 引用当前不可用
- **WHEN** inspect/list 读取的有效 Task Record 含当前机器无法解析、已迁移或暂时缺失的既有 Change 引用
- **THEN** Application MUST 返回完整 Task Record 与每个引用的稳定 availability/provenance diagnostic
- **AND** MUST NOT 隐藏、丢弃、自动删除或把整条 Task Record 判为损坏

#### Scenario: 删除失效引用或修改无关字段
- **WHEN** active Task 的某个既有 Change 引用当前不可用，而调用方明确删除该引用或只修改 title/intent/其他 scope
- **THEN** Application MUST 允许可独立验证的 mutation，并重新验证最终完整记录
- **AND** MUST NOT 因未被新增的旧引用不可用而阻塞整个 mutation
