## MODIFIED Requirements

### Requirement: Task-inline Plan必须是显式fallback
声明缺失或Task有一次性准备需求时，Buildr MUST允许Agent提交`task-inline`来源的Plan Request，其中包含完整scope coverage、Recipe与Steps。Receipt MUST明确标记无持久Project declaration来源并提供持久化next action；Buildr MUST不静默创建或更新`preparation.yml`。

#### Scenario: 首次Task使用task-inline
- **WHEN** Project没有Preparation Declaration且Agent已明确判断准备Steps
- **THEN** `prepare --plan` MUST能够形成v2 Task Plan并执行
- **AND** CLI与Buildr Web MUST将来源显示为`task-inline`
