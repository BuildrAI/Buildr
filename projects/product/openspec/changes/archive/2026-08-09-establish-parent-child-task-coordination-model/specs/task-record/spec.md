## ADDED Requirements

### Requirement: Task Record 必须保持父子顶层状态独立
Task Record Application MUST继续只保存单Parent关系与各Task自身顶层状态；Contribution、Parent Plan、Child Result/progress和专业handoff MUST NOT进入Task Record，且Child终态 MUST NOT传播Parent终态。

#### Scenario: Child completed Parent active
- **WHEN** 绑定Parent的Child通过Finish进入completed
- **THEN** Parent Task status MUST保持active
- **AND** Parent Record MUST NOT写入Child status副本或completed count

### Requirement: superseded Child 必须使用 abandoned 终态
当显式Parent reconciliation确认已创建Child的全部范围被其他Child覆盖时，Agent MUST以明确superseded reason调用既有abandon action；部分覆盖 MUST先更新Child intent/Change只保留residual scope。

#### Scenario: 全部范围被覆盖
- **WHEN** active Child没有任何residual Contribution
- **THEN** Task Record MUST接受明确superseded reason的abandon
- **AND** MUST NOT提供自动completed转换
