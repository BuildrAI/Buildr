## ADDED Requirements

### Requirement: task-manager 必须作为 Parent Task 的薄管理入口
`task-manager` MUST 只通过 Task Record Application 创建、检查和明确修改 Parent Task 关系，并 MUST 使用 canonical Workspace Task identity。Skill MUST NOT 直接操作 SQLite、构建通用关系图、自动修改 Child lifecycle 或冒充 Task Board writer。

#### Scenario: Agent 创建受 Parent 管理的 Task
- **WHEN** 用户明确要求一个 Task 管理另一个正式 Task
- **THEN** Agent MUST 通过 Task Manager create/update 动作保存 Parent relationship
- **AND** MUST 保持 Parent 与 Child 的 Environment、Development、Review、Verification、Finish 和终态决定独立

#### Scenario: Agent 判断协调 Task 完成
- **WHEN** Agent 根据 Child 状态与专业 evidence 判断 Parent 整体 Intent 是否满足
- **THEN** 该语义判断 MUST 通过 Parent 自己的明确 completion summary 或适用专业 Result 表达
- **AND** MUST NOT 仅因所有 Child terminal 而自动 complete Parent

#### Scenario: 层级不足以表达协调需求
- **WHEN** 真实需求需要未 Task 化规划、多协调归属、显式依赖条件、排序分组或跨 Task 决策记录
- **THEN** task-manager MUST 保持 Parent Task 边界并把缺口交回任务分流
- **AND** MUST NOT 把自由文本或临时推理伪装成新的关系字段

