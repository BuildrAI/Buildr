## ADDED Requirements

### Requirement: Task 详情必须展示协调计划与派生 Child 交付
Local App MUST在Task详情展示Parent Plan五类内容、Child identity/status、planned/delivered/extra/residual/superseded facts与final acceptance prerequisites；历史Task MUST显示不采用新模型的清晰空态。

#### Scenario: Child completed 但交付未证明
- **WHEN** read model返回completed Child和unproven Contribution
- **THEN** UI MUST分别显示Task已完成与Contribution未证明
- **AND** MUST NOT用完成图标暗示全部planned范围已交付

### Requirement: Local App 必须只提交显式协调动作
Local App MUST通过同一Application API提交reconciliation与final acceptance，不得自动创建/完成/abandon Child、自动改写Change或根据页面状态同步Parent Plan。

#### Scenario: 用户确认Parent reconciliation
- **WHEN** 用户基于current identity提交完整next Plan
- **THEN** UI MUST展示Application实际effects与新的identity
- **AND** 后续Child专业动作 MUST保持独立
