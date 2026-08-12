## ADDED Requirements

### Requirement: Task environment execution binding 必须包含 Workspace Node identity
Task environment receipt/context MUST 包含创建时的 Workspace Node identity、受管 executable 与 probe evidence；`executionReady` MUST 要求当前声明/runtime/CLI invocation 与该 identity 一致。

#### Scenario: 创建可执行 task environment
- **WHEN** task checkout、runtime projection、receipt-bound CLI 与 Workspace Node runtime 均匹配
- **THEN** context MUST 返回 `executionReady: true` 和 Node identity/executable evidence

#### Scenario: Node runtime 被删除或声明改变
- **WHEN** receipt 中的 Node identity 不再匹配当前声明或 executable probe 失败
- **THEN** context MUST 返回 stale/blocked 和 `executionReady: false`
- **AND** MUST 建议从 Workspace 声明执行 `sync`，不得由 Agent adapter 选择替代版本
