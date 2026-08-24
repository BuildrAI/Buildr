## ADDED Requirements

### Requirement: Parent v2 Planning Review 必须覆盖完整结构化 Plan identity
Task Review MUST 继续只以 Parent Plan identity 作为 Parent Planning Review target，并 MUST 让 v2 outcome、architecture decisions、全部 work-item 结构化字段、dependencies 与 final acceptance 的任一实质变化使旧 Result stale；expected/actual Child 运行事实变化但 Plan bytes 未变时 MUST 保持 current。

#### Scenario: 修改完整实施方向
- **WHEN** caller reconcile v2 Plan 并改变 work item objective、directions 或 boundaries
- **THEN** 旧 Planning Review applicability MUST 为 stale
- **AND** Parent startup MUST 在新的 ready Review 被 Development 消费前保持 blocked

#### Scenario: 创建真实 Child
- **WHEN** expected Child 对应的真实 Child 后续创建并绑定，但 Parent Plan bytes 未改变
- **THEN** Planning Review applicability MUST 保持 current
- **AND** Review repository MUST NOT 写入新 Result

