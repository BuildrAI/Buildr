## ADDED Requirements

### Requirement: Task Finish 与 Task Record complete 必须保持不同用户语义
Buildr MUST继续以`task-finish`解释“收尾、交付、合并、推送、retained检查与清理”，并以`task-manager`的complete operation表达Task Record terminal transition。`task-finish` Skill、`buildr.task-finish/v1` capability和`buildr task finish run|inspect`名称 MUST保留；Skill MUST只消费Task Finish Application Result，不得直接访问SQLite、SQL、migration、lease或transient files。

#### Scenario: 用户要求收尾有交付内容的 Task
- **WHEN** current Development handoff存在且用户要求提交、合并、推送、清理或完整收尾
- **THEN** Agent MUST路由`task-finish`并启动canonical五阶段执行器
- **AND** MUST NOT以`task complete`替代delivery、remote readback、Doctor或Environment cleanup

#### Scenario: Finish 成功结束 Task
- **WHEN** 产品执行器完成delivery、cleanup与SQLite terminal transaction
- **THEN** Agent MUST报告Task Finish complete及其compact delivery evidence
- **AND** Task Record completed MUST作为同一产品结果的终态事实，不得由Agent额外重跑complete

#### Scenario: 无变更 Task 直接完成
- **WHEN** Task Record Application已证明`noChange`且不存在需要交付的Content Target
- **THEN** `task-manager` MAY直接执行complete并记录no-change result
- **AND** MUST NOT伪造Task Finish run、completion、commit、push或cleanup evidence

#### Scenario: Agent 检查 Finish 状态
- **WHEN** Skill或Agent需要查看current/terminal Finish状态
- **THEN** MUST调用`buildr task finish inspect --task <task-id>`或绑定Application能力
- **AND** MUST NOT扫描`.buildr/task-finish`、查询SQLite或自行删除transient目录
