## ADDED Requirements

### Requirement: Agent 必须按 Parent协调 Child独立交付工作
Agent workflow MUST先建立/审查Parent Plan，再从Contribution创建绑定Parent但不继承Parent Change/Environment的Child Task；Child MUST从最新dev/canonical specs建立窄Change并独立完成Development/Review/Verification/Finish。

#### Scenario: 从Parent Contribution启动Child
- **WHEN** 用户选择一个未交付Contribution实施
- **THEN** Agent MUST创建带Parent关系和planned Contribution binding的Child Task
- **AND** MUST在Child ready Environment中创建自己的Change

### Requirement: Agent 必须显式 reconcile 范围变化
Agent发现Child跨Contribution或改变依赖/invariant/acceptance时 MUST暂停将普通状态变化解释为进度，读取saved handoff并显式reconcile Parent Plan；无法证明交付 MUST保持未完成。

#### Scenario: 未来Child仅剩部分范围
- **WHEN** saved handoff证明未来Child部分范围已被覆盖
- **THEN** Agent MUST更新未来Child intent与Change只保留residual
- **AND** MUST重新建立其planning target与适用Review
