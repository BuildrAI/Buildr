## Why

`task finish reconcile` 当前会在同一 Task 存在不同 Handoff 的失败 Finish run 时立即拒绝对账，即使当前 Handoff 的 Task Contribution 已被真实远端完整包含、旧 run 从未发生 delivery 副作用，且遗留的只是 Buildr 自己拥有的隔离 carrier。这样会把一次可由确定性证据闭合的登记失败变成永久 occupancy，任务既不能登记已有 Delivery，也不能进入正常 cleanup。

现在需要补上这条显式恢复路径，同时保持普通 `run` 对任何已有 carrier 的自动换绑禁令不变。

## What Changes

- 让显式 `task finish reconcile` 在 Handoff identity 冲突时先对当前 Handoff 建立全 repository 远端包含证明，而不是立即覆盖旧 run。
- 只允许恢复旧 run 已 terminal failed、停止在 delivery 前、没有 lease、delivery、retained、prepared completion 或 cleanup 事实，且所有遗留 carrier 都能按 run ownership 安全清理的情形。
- 远端包含或 carrier ownership/cleanup 任一无法证明时，保留旧 current run、carrier 和恢复现场，返回类型化 `unproven`/conflict。
- 全部证明通过后，终结并保留旧 run 的 Execution Record，以新的 reconciliation run 登记当前 Handoff 的 terminal Delivery 和 Task completion。
- 增加集成测试覆盖成功恢复、远端未包含、旧 run 已有下游副作用、carrier ownership 不可证明和 cleanup 失败。
- 不包含破坏性变更；普通 `task finish run` 的自动 supersede 边界保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 增加显式 reconciliation 对“旧失败 run 拥有可安全清理 carrier、当前 Handoff 已由远端完整包含”情形的 fail-closed 恢复要求。

## Impact

- 受影响实现：Task Finish reconciliation、run side-effect 分类、run-owned carrier cleanup 与 terminal persistence。
- 受影响接口：`buildr task finish reconcile` 的 conflict/unproven/result effects；不新增 CLI 参数。
- 受影响测试：Finish delivery reconciliation 的 integration tests，以及既有普通 run identity-conflict 回归。
- 不改变 Verification、Candidate、Development Handoff、Git delivery 或 Environment cleanup 的 authority。
