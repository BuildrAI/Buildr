# Design: 刷新 Task Finish 的 Activation 与 Environment Cleanup 状态

## Context

Delivery reconciliation 形成的 Finish completion 会初始化维护状态，但 self-bootstrap 与 Environment cleanup 由独立 owner 异步完成。当前没有一个 Product-owned 入口把这两个后续事实重新对账到 Finish completion，因此 terminal delivery 只会继续显示初始状态。

## Goals / Non-Goals

### Goals

- 使用 Finish run/task identity fencing，拒绝 foreign 或过期结果。
- 让 runner result 与 Environment current receipt 都能触发同一个幂等刷新路径。
- 仅更新 Finish maintenance projection，并让 Finish inspect 与 terminal delivery 读取同一份结果。
- 维护既有 Delivery、carrier、remote ref、Task completion 和 Environment receipt。

### Non-Goals

- 不重新执行 Delivery、self-bootstrap、Doctor 或 Environment cleanup。
- 不把 Doctor ready 单独推断为 self-bootstrap passed。
- 不改变 self-bootstrap 阶段 authority，也不让 runner 直接写 SQLite。

## Decisions

### Decision 1: Product-owned maintenance reconciliation

在 Task Finish application 增加 maintenance reconciliation action。它接收 runner 产生的结构化 closeout result（可选），并始终从 Product-owned Environment current 读取 cleanup status。Product repository 负责原子更新 current/terminal Finish payload，使所有读模型共享同一事实。

备选方案是只在 inspect 时做临时 overlay；该方案无法让 Environment cleanup 的后续动作复用已确认的 self-bootstrap result，也会造成不同消费者看到不同状态，因此不采用。

### Decision 2: 两个 owner 在事实形成后触发

self-bootstrap runner 在最终 Doctor 通过后调用 maintenance reconciliation；Environment cleanup 在写入 cleaned receipt 后调用同一入口。任一调用都可幂等执行，调用顺序不影响最终结果。

### Decision 3: identity and status fencing

runner result 必须匹配 `schemaVersion`、Task ID 和 Finish run ID。只有 `passed` 才投影 `activation=passed`；blocked/failed 只保留 attention。Environment receipt 的 `cleaned` 投影为 `environmentCleanup=cleaned`，ready 保持 pending，blocked/unavailable 投影为 attention。所有 Delivery 字段保持原值。

## Risks / Trade-offs

- 如果维护刷新失败，Delivery 仍保持已成立；调用方得到明确 maintenance diagnostic，需要稍后重试。
- 旧 Finish completion 没有 self-bootstrap evidence 时，Environment cleanup 仍可独立刷新 Cleanup，但不会凭 Doctor 或 cleanup 事实伪造 Activation passed。
- Finish payload 会保留精简的 self-bootstrap result identity/status，增加少量持久化体积换取可恢复性。

## Migration Plan

不迁移历史数据。新 runner 或下一次 Environment cleanup 会通过正式入口刷新已有 matching Finish run；无需手工编辑 SQLite/JSON。旧数据仍按原 maintenance 值读取，直到有新的正式事实触发对账。

## Open Questions

无。
