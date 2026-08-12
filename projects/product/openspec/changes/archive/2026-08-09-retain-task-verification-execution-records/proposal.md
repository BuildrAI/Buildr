## Why

Buildr 已有正式 Task execution record 底座，但 `buildr verification run` 仍只把 stdout、stderr、耗时、资源协调和 target drift 保存在 provider-owned transient 目录；cleanup 后无法解释失败、重试或中断。现在需要把带 Task Environment context 的正式 Verification attempt 接入该底座，同时保持 Task 外 runner 和 `task_verification_current` 的既有 authority 不变。

## What Changes

- 带合法正式 Task Environment context 的 `verification run` 在启动 capability 前打开一条 `task-verification/verification-execution` record，先取得固定 quota reservation；backpressure 时不启动 producer。
- 一次 runner invocation 对应一个独立 run identity 和 execution record；失败、重试、取消、中断与 target drift 不覆盖其他 attempt。
- runner 将受控执行摘要、stdout、stderr、有限 timeline 与 diagnostics 交给 Task Execution Record Application 脱敏、截断并 seal；transient evidence 继续由 Verification runner 管理并在持久化成功后精确 cleanup。
- Task 外执行继续只产生 transient evidence；调用前 invalid request 不创建 execution record。
- current Verification Result 继续只保存 target、declarations、capability facts、coverage gaps 与正式结论，不增加 execution history、Consumer/Adoption 或日志字段。
- `buildr.verification-execution/v1` 兼容增加 execution record operation summary，使 Agent 能区分未适用、已保留、backpressure 或 attention，而不暴露 SQLite 或正文绝对路径。
- 本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: 正式 Task command runner execution 接入 execution record，同时保持 Task 外 transient execution 与 current Result 边界。
- `task-execution-artifacts`: 定义 Verification producer 的 closed metadata/body 映射、outcome 规则与 seal/cleanup 顺序。
- `public-json-contracts`: 为 `buildr.verification-execution/v1` 增加兼容的 execution record operation summary，并规定 invalid request 与持久化失败语义。

## Impact

- 代码：Verification application/runner、Task Execution Record Application port 组合和 transient evidence lifecycle。
- 数据：复用现有 `task_execution_records` 与 `.buildr/local/task-execution-records/task-verification/<record-id>/`，不新增 migration、表或第二 authority。
- 公开接口：`buildr verification run --json` v1 只做 additive 字段扩展；Task Verification Result schema 不变。
- 测试：补充正式 Task passed/failed/retry/target drift/backpressure/interruption、Task 外 transient-only、invalid request 零 record、正文脱敏/截断与 cleanup 顺序覆盖。
