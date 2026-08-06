## ADDED Requirements

### Requirement: Local App 必须展示保存的终态交付事实
Local App 的任务终态投影 MUST 展示最近一次 Finish 已保存的 terminal association snapshot，并明确其为交付时事实。页面读取 MUST NOT 因当前 Review、Verification 或 Development 状态变化而重新推导历史交付关联。

#### Scenario: 已完成 Task 打开终态信息
- **WHEN** 用户读取已有 terminal association snapshot 的已完成 Task
- **THEN** HTTP interface MUST 通过 Application 返回保存的 handoff/gate 关联
- **AND** Web 页面 MUST 将其呈现为最近一次正式交付采用的事实
