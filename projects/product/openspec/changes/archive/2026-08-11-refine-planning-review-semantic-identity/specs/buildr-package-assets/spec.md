## ADDED Requirements

### Requirement: Buildr package 必须交付 Task Planning Identity consumer闭环
Buildr package MUST 原子交付Task Planning Identity Domain/Application、runtime composition、内部只读driver、相关contracts/specs与更新后的 `task-development`、`task-review`、OpenSpec propose/update/apply/contract-guard Skills。Package static validation与contract tests MUST证明consumer使用resolver结果且不再指引Agent手工摘要OpenSpec planning target。

#### Scenario: Package 与runtime projection完整
- **WHEN** Buildr构建package并向Workspace投射Skills
- **THEN** resolver内部入口、结果契约和全部相关consumer指引 MUST同时存在且相互一致
- **AND** 任一缺失、旧手工摘要指引或版本接线漂移 MUST使package检查失败

