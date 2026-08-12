## MODIFIED Requirements

### Requirement: Buildr OpenSpec sidebars 只表达 Buildr 特有增量
Buildr MUST 仅在上游 workflow 未覆盖且 Buildr consumer 需要该约束时保留 OpenSpec Skill Contribution，并通过 Component integrity 和组合测试验证固定组合。

#### Scenario: 保留 Buildr 特有 sidebar
- **WHEN** sidebar 约束 task-worktree 决策、Candidate evidence、proposal baseline gate 或 Task Finish pre-sync/post-sync gate
- **THEN** Buildr MUST 保留并验证该 contribution

#### Scenario: 上游已提供相同路径保证
- **WHEN** OpenSpec 1.6.0 workflow 已通过 status context 解析 change、artifact paths 和 `changeRoot`
- **THEN** Buildr MUST 合并或删除只重复该保证的 explore、sync 或 archive sidebar 内容
- **AND** Buildr MUST NOT 因删减重复文案而移除 task-triage 或 Task Finish 的安全门禁

#### Scenario: Sidebar 不建立独立 capability contract
- **WHEN** sidebar 只作为 OpenSpec Component 固定组合中的自然语言增量且没有可替换 provider
- **THEN** Buildr MUST 使用 Component member integrity 和 composition tests 保护它
- **AND** Buildr MUST NOT 为每个 sidebar 创建 `provides`、`requires` 或 binding
- **AND** 现有 task-worktree、task-verification、git-operations、task-asset-review 和 task-finish capability contracts MUST 保持有效
