## Why

当前 Formal Task Finish 可以完成远端交付、runtime activation 与 Environment cleanup，却不会把顶层 Task Record 从 `active` 更新为 `completed`。这会让任务列表继续显示进行中，并使要求“Task completed + Finish complete”的 terminal delivery projection 无法证明任务已交付。

## What Changes

- Task Finish 在交付、Environment cleanup 与隔离 Delivery Carrier cleanup 均成功后，通过 Task Record Application 提交 `completed`、`noChange: false` 的顶层终态。
- 已经是 `completed` 且 `noChange: false` 的 Task 作为幂等恢复继续；`completed/noChange: true`、`abandoned` 或其他冲突终态保持原样并阻塞 Finish。
- Finish blocked/failed、远端交付未完成、Environment cleanup 未完成或 carrier cleanup 未完成时不得提前更新 Task Record。
- 增加 Application、Finish journey 与终态投影相关回归，证明成功、失败和恢复路径的状态边界。
- 本变更不包含破坏性 CLI 或 schema 变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 增加 Formal Finish 成功后的 Task Record 终态提交、冲突处理与幂等恢复要求。
- `task-record`: 明确 Task Finish 只能通过 Task Record Application 提交正常完成终态，并保持 Task Record 唯一 writer 与终态不可覆盖边界。

## Impact

- `src/application/task-finish/`：cleanup 成功边界与 Task Record Application 调用。
- `src/application/task-record/`：必要的内部幂等完成动作或结果边界，不改变公开 CLI schema。
- `test/integration/`、`test/system/`：成功、失败、冲突终态与恢复回归。
- Local App 无需新增 writer；既有 terminal delivery projection 将在 Task 完成后自然显示 `delivered`。
