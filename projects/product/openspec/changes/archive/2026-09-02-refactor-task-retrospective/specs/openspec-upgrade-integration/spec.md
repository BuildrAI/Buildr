## MODIFIED Requirements

### Requirement: Buildr OpenSpec sidebars 只表达 Buildr 特有增量
Buildr MUST仅在上游workflow未覆盖且Buildr consumer需要该约束时保留OpenSpec Skill Contribution，并通过Component integrity和组合测试验证固定组合。

#### Scenario: 保留 Buildr 特有 sidebar
- **WHEN** sidebar约束task-worktree决策、Candidate evidence、proposal planning gate或Task Finish convergence gate
- **THEN** Buildr MUST保留并验证该contribution

#### Scenario: 上游已提供相同路径保证
- **WHEN** OpenSpec 1.6.0 workflow已通过status context解析change、artifact paths和`changeRoot`
- **THEN** Buildr MUST合并或删除只重复该保证的explore、sync或archive sidebar内容
- **AND** Buildr MUST NOT因删减重复文案而移除task-triage或Task Finish的安全门禁

#### Scenario: Sidebar 不建立独立 capability contract
- **WHEN** sidebar只作为OpenSpec Component固定组合中的自然语言增量且没有可替换provider
- **THEN** Buildr MUST使用Component member integrity和composition tests保护它
- **AND** Buildr MUST NOT为每个sidebar创建`provides`、`requires`或binding
- **AND** 现有task-worktree、task-verification、git-operations和task-finish capability contracts MUST保持有效，已退役Task Retrospective contract MUST不存在
