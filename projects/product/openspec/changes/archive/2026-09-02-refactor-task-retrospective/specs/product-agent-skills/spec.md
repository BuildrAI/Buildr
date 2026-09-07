## ADDED Requirements

### Requirement: 产品必须投射纯任务复盘Skill
Buildr package MUST继续投射可选`task-retrospective` Skill，指导Agent按用户明确要求生成固定本机Markdown、登记Task Record文档事实和处理缺失数据。该Skill MUST不提供独立capability，不调用内部Driver，不维护处置队列或专用来源关系。

#### Scenario: 用户明确要求复盘
- **WHEN** Agent runtime发现终态Task复盘意图
- **THEN** Agent MUST读取纯Skill并组合当前Task与真实工具
- **AND** provider缺失 MUST不成为问题，因为不存在可替换Retrospective Application能力

#### Scenario: 用户接受后续行动
- **WHEN** 用户明确决定复用或创建普通Task
- **THEN** Skill MUST把精确Task effects交给Task Manager
- **AND** MUST不创建专用relation、action item或自动修改其他资产

## REMOVED Requirements

### Requirement: 产品入口 Buildr Skill 路由 Task Retrospective
**Reason**: 不再路由独立capability provider。
**Migration**: 按Skill description直接发现`task-retrospective`。

### Requirement: 产品入口按 current capability 路由复盘意图
**Reason**: Retrospective capability contract和binding删除。
**Migration**: 使用可选纯Skill。

### Requirement: Task Retrospective Skill 必须完成后续落地闭环
**Reason**: 专用处置与来源闭环删除。
**Migration**: 用户决定后使用普通Task；决定状态只由Task Record维护。
