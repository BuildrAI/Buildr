# Proposal: 刷新 Task Finish 的 Activation 与 Environment Cleanup 状态

## Why

Task Finish 交付对账会先形成 `activation=attention`、`environmentCleanup=pending` 的维护投影。后续 self-bootstrap runner 已完成自举且 Task Environment 已完成清理时，Finish 仍读取初始投影，导致汇总与当前事实不一致。

## What Changes

- 增加由 Product Application 负责的 Finish maintenance 对账入口。
- 入口消费受 identity 约束的 self-bootstrap closeout result，并读取 Task Environment current receipt。
- self-bootstrap 成功后刷新 Activation；Environment cleanup 成功后刷新 Cleanup；只更新维护投影，不改写已成立的 Delivery evidence。
- self-bootstrap runner 在成功收尾后调用该入口，Task Environment cleanup 在形成 cleaned receipt 后再次调用该入口。

## Capabilities

- Modified existing capability: `task-finish-execution`
- Modified existing capability: `task-closeout-orchestration`

## Impact

- 受影响代码：Product Buildr Service 的 Task Finish、Task Environment application/repository，以及 self-bootstrap closeout runner。
- 受影响持久化：仅通过现有 Product writer 更新 Finish maintenance projection；不直接编辑 SQLite 或 JSON。
- Delivery、Task Record、Development、Verification、Review 和 Environment receipt 的 authority 不变。
- 不引入 breaking change；新增 maintenance reconciliation 是向后兼容的内部/agent-machine 调用。
