## MODIFIED Requirements

### Requirement: Workspace 可以通过 Skill Contribution 扩展 Task Finish 后续维护
Workspace Component MAY通过`task-finish@append`追加Workspace专属维护。Contribution MUST明确只在Formal Task Finish成功后、Agent最终报告完整收尾前执行，不得插入或改写产品固定五阶段、Formal Result、Candidate、Verification、Review、decision或Environment cleanup事实。通用`task-finish` Skill MUST NOT为Workspace专属维护声明命名slot或依赖自举Skill。

#### Scenario: 自举 Workspace 安装扩展
- **WHEN** Buildr自举Workspace安装同时拥有专属Skill与Contribution的Workspace Component
- **THEN** runtime MUST把Contribution追加到有效`task-finish` Skill末尾
- **AND** 普通用户Workspace未安装该Component时 MUST保持原Task Finish内容和行为，且通用Skill不包含自举slot

#### Scenario: 自举收敛未完成
- **WHEN** Formal Task Finish成功但Workspace专属自举收敛失败
- **THEN** Agent MUST报告主任务已交付且Workspace收敛未完成，并保留精确恢复现场
- **AND** MUST NOT改写或撤销Formal Task Finish Result与上游研发事实
