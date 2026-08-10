## Why

Task Finish 当前把阶段 checks、operations、observations 与有界 output 累积在 `task_finish_current`，完整命令诊断则只存在于成功后会清理的 run-owned transient 现场；一次 Finish run 经过阻塞和恢复时，各 invocation 的失败、重试、target race 与 cleanup 诊断无法作为独立执行事实保留。C1 已开放 `task-finish/finish-diagnostics` execution record 类型，C2 也已证明 Verification producer 的 open、seal、transient cleanup 顺序，现在需要以相同底座接入 Finish，同时不转移 Delivery Carrier、target、resume 和恢复资源的 owner。

## What Changes

- 每次真正开始执行的正式 `task finish run` invocation 使用独立 invocation identity 打开一条 `task-finish/finish-diagnostics` record；同一 Finish run 的恢复 invocation 不覆盖旧记录。
- 在调用前校验与 no-op 判断完成后、任何阶段、target、Delivery Carrier 或恢复状态副作用前预留 execution record 容量；backpressure 时保持 Finish current、remote、Carrier 与恢复资源不变。
- 将该 invocation 的 portable summary、五阶段 timeline、diagnostics 以及受控 stdout/stderr 写入既有 closed body Store，并映射 `passed|blocked|failed|cancelled` outcome。
- 只有 record 已证明 retained 后才精确清理该 invocation 的 diagnostics transient；seal 或确认失败时保留 transient 现场。
- `task_finish_current` 继续独立拥有 Finish run、阶段状态、当前失败、target/lease、resume、cleanup 与终态关联；不保存 execution record ID、history 或正文。Delivery Carrier 与其他恢复资源继续只由 Finish owner 管理和清理。
- `buildr.task-finish-result/v2` 兼容增加 portable `executionRecord` operation summary；execution record seal 失败不得回滚或改写已经成立的远端交付、Task terminal、Environment cleanup 或 Finish terminal truth。
- 完成旧“Finish diagnostics 仍为 transient-only”的产品文档和 current knowledge 更新；不新增 SQLite migration、record reader/Inventory、Consumer/Adoption、批量 GC 或通用 event/history 模型。
- 本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-execution-artifacts`: 定义 Finish invocation 到 closed execution record 的 metadata/body、outcome 与 retained-before-cleanup 映射。
- `task-finish-execution`: 在固定五阶段 Finish 外围增加 invocation execution record 编排，同时保持 current、Carrier、target、resume 与恢复资源的 owner 边界。
- `public-json-contracts`: 为 `buildr.task-finish-result/v2` 增加兼容的 portable execution record operation summary 和失败语义。

## Impact

- 代码：Task Finish Application/run/product executor、invocation diagnostics collector、Task Execution Record Application 组合与 JSON contract mapper。
- 数据：复用现有 `task_execution_records` 与 `.buildr/local/task-execution-records/task-finish/<record-id>/`；新增的 diagnostics transient 位于 Finish provider-owned transient root，不新增 migration、表或第二状态 authority。
- 公开接口：`task finish run --json` 的 v2 payload 只做 additive 扩展；`task finish inspect` 与 `task_finish_current` 不增加 execution history/read API。
- 测试：覆盖 passed、blocked/resume、多 invocation、failed、target race、cleanup pending、backpressure 零副作用、seal failure 保留 transient、invalid/no-op 零 record、正文脱敏与 owner cleanup 边界。
