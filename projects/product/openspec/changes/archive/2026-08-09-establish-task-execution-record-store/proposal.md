## Why

Buildr 已把 Task current/terminal facts 与 execution resources 分配给各专业 Application，但正式 Task 的完整执行过程仍缺少一套可恢复、可限额、可清理的共享记录底座。现在先建立不接 producer 的单一 authority，可以让后续 Verification 与 Finish 分别接入，而不再复制临时日志、诊断和清理状态。

## What Changes

- 新增 Task Execution Record Domain/Application，管理正式 Task execution record 的 closed metadata 与正文生命周期。
- 新增 Workspace-local 受限正文 Store：写入前版本化脱敏、staging/atomic publish、路径与 symlink 防护、安全截断和 digest/size 计算。
- 固定 4 MiB 单文件、16 MiB 单 record、256 MiB Task-owner、2 GiB Workspace 配额，并在 producer execution 启动前执行 reservation/backpressure。
- 新增连续 SQLite migration、单张 `task_execution_records` 表、repository、状态转换与 retention/cleanup 查询底座。
- 增加 Domain、Application、正文 Store、repository 与 migration 的 Unit/Integration tests。
- v1 不接入 Verification/Finish producer，不建立 Consumer/Adoption、通用 event/history payload、任意 retention policy 或 execution resource writer。
- 本 Change 不包含破坏性外部接口变更；SQLite 升级仍遵循已有向前 migration 与 database-newer fail-closed 规则。

## Capabilities

### New Capabilities

- `task-execution-artifacts`: 定义正式 Task execution record 的单一 Application authority、受限正文 Store、固定容量/backpressure 和 retention/cleanup 状态边界。

### Modified Capabilities

- `workspace-structured-data-store`: 在当前连续 migration ledger 上增加单张 execution record metadata 表及其约束、索引和 repository 边界。

## Impact

- 代码：`src/domain/task-execution-record/`、`src/application/task-execution-record/`、`src/infrastructure/filesystem/`、`src/infrastructure/sqlite/` 与 composition root。
- 数据：Workspace SQLite 增加下一连续 migration；正文只进入 `.buildr/local/task-execution-records/`，不进入 SQLite BLOB/JSON payload。
- 测试：新增 Domain/Store Unit tests、Application/repository Integration tests，以及从 migration `0010` 连续升级的覆盖。
- 无新增 CLI、Local App 页面或 producer 接线；后续 Child Tasks 分别负责 Verification、Finish、Inventory 和 GC。
