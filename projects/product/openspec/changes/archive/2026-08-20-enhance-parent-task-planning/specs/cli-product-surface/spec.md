## ADDED Requirements

### Requirement: Parent Plan CLI 必须发现 v2 并稳定区分计划与运行事实
`task parent record|reconcile --schema|--example` MUST 只公开 v2 input；`record` MUST 拒绝 v1 新写入，`reconcile` MUST 允许以 current v1 identity 显式提交完整 v2 完成升级。`inspect` JSON MUST 分别返回 stored Plan schema、rich work-item projection、expected Child、eligibility 与 actual Child binding/delivery facts。

#### Scenario: 发现 v2 schema
- **WHEN** Agent 调用 `task parent record --schema` 或 `--example`
- **THEN** CLI MUST 返回包含 priority/title/objective/directions/boundaries/expectedChild/dependencies 的 v2 closed input
- **AND** MUST 不再推荐 `plannedChildTaskId`

#### Scenario: inspect expected 与 actual
- **WHEN** 一个 work item 同时具有 expected Child 文本和真实 active Child binding
- **THEN** JSON MUST 在不同字段返回预计信息与 actual Child identity/status
- **AND** MUST 不用 `plannedChildTaskId` 或 UI 推导真实状态

## MODIFIED Requirements

### Requirement: Parent Plan CLI必须提供输入discoverability
Parent Plan record/reconcile CLI MUST为closed输入提供机器可读schema与example发现方式，并与实际Application validation保持同步。

#### Scenario: Agent发现Parent Plan输入
- **WHEN** Agent请求Parent Plan record或reconcile的schema/example
- **THEN** CLI MUST返回outcome、architectureDecisions、包含完整实施指令与边界的contributions、finalAcceptance的v2 closed shape及最小合法样例
- **AND** Agent MUST不需要读取产品源码、测试或SQLite来构造输入
