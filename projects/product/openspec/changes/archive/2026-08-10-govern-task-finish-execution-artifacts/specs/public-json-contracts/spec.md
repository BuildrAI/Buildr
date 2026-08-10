## ADDED Requirements

### Requirement: Task Finish run 必须提供 portable execution record operation summary
`buildr task finish run --json` MUST继续输出`buildr.task-finish-result/v2`并以additive `executionRecord` summary表达`not-opened|retained|blocked|attention`、portable record identity/outcome/lifecycle/body summary、diagnostics transient cleanup、diagnostic与next action。Payload MUST NOT暴露SQLite/database、body或transient locator、本机持久路径、Carrier路径、remote credential、lease/resume/resource token，也 MUST NOT把execution record解释为Finish current、delivery、Task terminal或Result adoption authority。`task finish inspect --json` MUST保持既有pure Finish read model且不添加record列表或正文。

#### Scenario: Finish invocation retained
- **WHEN**一次实际执行的Finish invocation已terminal seal且record retained
- **THEN** run JSON MUST返回portable record ID、outcome、lifecycle、body digest/size/truncated与diagnostics cleanup disposition
- **AND** 顶层Finish status、failure、resume与delivery facts MUST继续由`task_finish_current`决定

#### Scenario: record open backpressure
- **WHEN** record quota reservation在任何Finish execution side effect前被拒绝
- **THEN** run JSON MUST返回blocked execution record summary、portable diagnostic与唯一cleanup/resolution next action
- **AND** MUST不返回伪Finish run、phase、Carrier、delivery mutation或terminal completion

#### Scenario: Finish完成后record attention
- **WHEN** Finish owner已形成complete terminal truth但record seal、post-read或diagnostics cleanup无法完整确认
- **THEN** JSON MUST保持`status: complete`并返回`executionRecord.status: attention`
- **AND** MUST明确保留或已retained的evidence disposition，不得要求重跑Finish或暴露本机恢复locator

#### Scenario: invalid或no-op invocation
- **WHEN** request在open前无效，或既有Finish已经complete且run只返回幂等no-op
- **THEN** JSON MUST返回`executionRecord.status: not-opened`与零record effect
- **AND** MUST不创建execution record、diagnostics transient或改变既有Finish facts
