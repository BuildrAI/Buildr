## MODIFIED Requirements

### Requirement: Task Finish CLI 失败必须直接定位并给出唯一 workflow

Task Finish JSON error/result MUST优先返回真实`phase`、`operation|check`、`failureClass`、`code|status|exit`、bounded diagnostic identity与唯一`nextWorkflow|nextAction`。只有Task Development Application报告Candidate applicability stale时，Finish才 MUST指向`task-development`；同一frozen Candidate可恢复的target race、Delivery Adaptation、retained或cleanup阻塞 MUST返回产品生成的exact resume token。未知参数与缺失context MUST返回canonical run/inspect help topic。

#### Scenario: Verification 子检查失败

- **WHEN** Task Development Application报告Content Target、Candidate、gate或handoff stale
- **THEN** CLI MUST返回具体Development finding与`nextWorkflow: task-development`
- **AND** MUST NOT把Finish自己的Git判断伪装成Development applicability evidence

#### Scenario: Delivery Adaptation required

- **WHEN** prepare在最新Delivery Baseline机械应用Task Contribution失败但Development handoff仍current
- **THEN** CLI MUST返回`delivery-adaptation-required`或`semantic-review-required`、carrier facts与exact resume token
- **AND** `nextAction` MUST指向在run-owned carrier完成Agent review后重复canonical run，不得输出`nextWorkflow: task-development`

#### Scenario: Target race 可恢复

- **WHEN** frozen Candidate未变但目标ref在push前漂移
- **THEN** CLI MUST返回`phase: deliver`、`code: task-finish.target-race`和产品生成的resume token
- **AND** nextAction MUST是重复canonical run/resume，而不是手写recovery JSON
