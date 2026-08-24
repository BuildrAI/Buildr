## ADDED Requirements

### Requirement: Parent coordination CLI 必须只输出v3 canonical字段
`task parent inspect|record|refresh-planning|bind-child|reconcile|accept --json` MUST只输出Parent Coordination v3，并 MUST让业务blocked路径使用同一v3 envelope。非JSON人类可读行为可以保持不变。

#### Scenario: inspect成功
- **WHEN** Agent运行`task parent inspect <task-id> --json`
- **THEN** stdout MUST是单一v3对象且stderr为空
- **AND** MUST不包含任何已删除v2字段

#### Scenario: mutation被拒绝
- **WHEN** Parent action因identity、状态或输入冲突被拒绝
- **THEN** stdout MUST仍是单一v3 blocked对象并保持非零退出
- **AND** diagnostic与effects MUST保持准确
