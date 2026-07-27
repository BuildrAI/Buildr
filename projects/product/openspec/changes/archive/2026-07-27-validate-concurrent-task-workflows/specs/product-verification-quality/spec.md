## ADDED Requirements

### Requirement: Candidate 包含双任务并发整体验收
Buildr Product Candidate MUST 将 `concurrent-task-acceptance` 登记为 required verification step，并 MUST 使用独立 executor 和预算执行，不得由其他单项测试的通过状态推断该组合验收通过。

#### Scenario: 执行完整候选验证
- **WHEN** 维护者执行 Product Candidate 验证
- **THEN** verification registry MUST 选择 `concurrent-task-acceptance`
- **AND** 该步骤失败或证据不完整时 Candidate MUST 失败
