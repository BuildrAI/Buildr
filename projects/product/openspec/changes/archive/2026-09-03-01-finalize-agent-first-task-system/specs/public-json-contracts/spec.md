## MODIFIED Requirements

### Requirement: Task JSON 必须稳定表达 Parent 与直接 Children
Task Record operation JSON MUST在record中返回nullable `parentTaskId`与显式`isParent`，并在独立`taskRelations`查询投影中返回排序后的直接Children摘要。`childTaskIds`、Child数量、数据库row、SQL、路径、祖先闭包或递归Task正文 MUST不进入Task Record schema。

#### Scenario: 独立 Task JSON
- **WHEN** create、inspect或list返回没有Parent和Children的Task
- **THEN** record MUST包含`parentTaskId: null`
- **AND** `taskRelations.children` MUST为空

#### Scenario: Parent 与 Child JSON
- **WHEN** inspect返回存在直接层级关系的Task
- **THEN** Child record MUST返回直接`parentTaskId`，Parent view MUST在`taskRelations.children`返回排序摘要
- **AND** MUST不返回`childTaskIds`或递归record

#### Scenario: 旧 JSON consumer
- **WHEN** consumer仍要求record内`childTaskIds`或旧schema shape
- **THEN** 当前closed schema MUST拒绝该字段
- **AND** consumer MUST迁移到`taskRelations.children`

### Requirement: Parent coordination JSON 必须closed且登记
Buildr MUST只登记`buildr.parent-coordination-result/v4`的closed inspect响应；响应 MUST包含Task ID、record digest、`parent|child|ordinary` mode、Parent状态、目标、结果、Parent来源、直接Children、完成观察、可选旧计划历史、局部诊断与零effects。

#### Scenario: inspect public JSON
- **WHEN** client请求Parent coordination read model
- **THEN** response MUST通过closed专业HTTP Schema并使用生成DTO
- **AND** MUST不包含Contribution、Handoff、Development、Review、Verification、交付或环境字段

### Requirement: legacy absence 必须是明确contract
旧Parent Plan不存在 MUST以`historicalPlan: null`表达；存在时只作为历史内容返回。它 MUST不改变当前`mode`、`isParent`、完成观察或Task状态。

#### Scenario: 只有旧Parent Plan
- **WHEN**普通Task仅保存`legacy_parent_plan_json`
- **THEN** Parent coordination MUST保持ordinary或child当前身份
- **AND** MUST不要求父任务完成授权

#### Scenario: 旧Task JSON
- **WHEN**历史Task没有旧Parent Plan或Contribution Handoff
- **THEN** 当前响应 MUST使用`historicalPlan: null`和真实Task关系
- **AND** MUST不回填或读取Handoff
