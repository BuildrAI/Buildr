## Why

显式 reconciliation 已完成 current Handoff 远端包含与旧 carrier cleanup 后，SQLite terminal finalize 仍要求新 reconciliation run ID 等于旧 current run ID，导致合法恢复无法原子落盘。必须让 Persistence 在精确校验旧 current 快照未漂移后完成受控替换。

## What Changes

- 为 recovery terminal finalize 增加 expected superseded run ID 与 run digest fencing。
- 在同一 SQLite transaction 内读取 current row、校验其仍是精确的旧 failed run，再写入新 terminal row。
- current row 缺失、run ID/digest/status/kind 任一漂移时保持零写入并返回 conflict。
- 普通 finalize 不提供 recovery fencing 时继续只允许同 run ID 原地终结。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：明确旧失败 run recovery 的 terminal persistence 必须以旧 current run ID 与 digest 做事务内原子替换。

## Impact

影响 Task Finish SQLite Repository、delivery reconciliation 调用与 SQLite/Integration tests；不改变远端证明、repository topology、carrier cleanup 或普通 Finish run。
