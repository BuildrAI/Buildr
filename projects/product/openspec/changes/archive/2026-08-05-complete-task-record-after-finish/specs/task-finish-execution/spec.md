## ADDED Requirements

### Requirement: Task Finish 必须在完整成功后提交顶层 Task 终态
Formal Task Finish MUST 在远端交付、retained activation/Doctor、Task Environment cleanup 与 run-owned Delivery Carrier cleanup 全部成功后，通过 Task Record Application 将对应 active Task 提交为 `completed` 且 `result.noChange=false`。Task Finish MUST NOT 直接写 Workspace SQLite、复制 Task Record authority，或在任一 deliver/cleanup 动作 blocked、failed、未执行时提前改变 Task 顶层状态。只有 Task Record Application 提交成功或确认既有等价 completed 终态后，Finish completion 才可从 `prepared` 进入 `complete`。

#### Scenario: 完整收尾后自动完成 Task
- **WHEN** Formal Finish 的 delivery、Environment cleanup 与 Delivery Carrier cleanup 全部成功，且 Task Record 仍为 active
- **THEN** Task Finish MUST 通过 Task Record Application 写入 `status: completed` 与 `result.noChange: false`
- **AND** Finish Result MUST 在该提交成功后返回 complete

#### Scenario: 收尾阻塞不改变 Task
- **WHEN** delivery、Environment cleanup、Delivery Carrier cleanup 或 Task Record Application 提交任一步骤 blocked 或 failed
- **THEN** Task Finish MUST NOT 把 active Task 冒充为 completed
- **AND** run MUST 保留可恢复事实与具体 primary failure

#### Scenario: 已完成 Task 的幂等恢复
- **WHEN** Finish resume 观察到同一 Task 已是 `completed` 且 `result.noChange=false`
- **THEN** Task Record Application MUST 返回幂等成功且不产生重复 mutation effect
- **AND** Task Finish MAY 继续写入匹配的 complete completion

#### Scenario: 冲突终态阻止 Finish 完成
- **WHEN** Finish 提交终态时 Task 已是 `completed/noChange=true` 或 `abandoned`
- **THEN** Task Record Application MUST 保留原终态并返回冲突
- **AND** Task Finish MUST 保持 blocked 且不得写入 complete completion

