## Why

Task Finish 当前用 run、completion、target lease、transient artifact 四张表保存同一专业流程的 current/terminal 状态，导致同一 Task 的生命周期、prepared completion 与 current run 需要跨表同步，Overview 和 terminal projection 也必须同时理解多份 authority。现在执行记录能力已经独立持有大体量诊断，Finish 可以收敛为一份 Task current authority 和一份固定阶段明细，减少重复状态与恢复分支。

## What Changes

- 用 `task_finish_current` 保存每个 Task 唯一的 current 或 terminal Finish 状态，并把 target-scoped lease 作为该行的互斥字段。
- 五个固定阶段整体保存于 `task_finish_current.phases_json`；跨 Task 查询需要的总体状态、当前阶段、关键 identity、当前失败、resume、cleanup、lease 与时间继续使用普通列。
- 新增连续 Workspace SQLite migration，迁移旧 run/completion/lease 数据，校验安全后删除四张旧表；无法证明安全的旧状态必须回滚 migration。
- Task Finish Application 和 repository 改为单一 current writer；Overview、Terminal Delivery、CLI 与 Local App 从新表组合原有公开结果语义。
- 移除 Finish transient artifact metadata 表；大体量执行诊断仍由独立 execution-record producer change 负责，本 Change 不接入或修改 `task_execution_records` producer。
- 保持固定五阶段、Task Environment cleanup、Task Record terminal writer、Git delivery 与 Development handoff 边界不变。
- **BREAKING**：Workspace SQLite 内部专业 schema 删除 `task_finish_runs`、`task_finish_completions`、`task_finish_target_leases` 与 `task_finish_transient_artifacts`；这不是公开 CLI/HTTP 契约破坏。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: 将 Task Finish 四表 authority 收敛为单一 current 表，并定义安全迁移、约束和索引。
- `task-finish-execution`: 将 run/completion/lease/transient metadata 的持久化与恢复语义改为单一 current row、受验证 phases JSON 和内嵌 target lease。
- `task-overview-query`: Overview 与 Terminal Delivery 改为从单一 Finish current authority 读取 current/terminal association。
- `local-workspace-application`: Local App 的 Finish current/terminal projection 改为消费新的 Application read model，同时保持页面语义兼容。

## Impact

- 影响 Workspace SQLite migration、Task Finish repository/Application、Overview/Terminal Delivery repository、Doctor/schema 检查及相关 unit/integration/system tests。
- 影响上述四项 canonical capability 的持久化与读取契约。
- 不新增依赖，不改变公开 Task Finish CLI 命令、五阶段、Task Environment 或 Task Execution Record owner 边界。
