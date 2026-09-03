## MODIFIED Requirements

### Requirement: Skill 必须区分 Capability Declaration、Execution 与 Result
Skill MUST把Project测试地图作为稳定测试体系事实，把Agent直接调用项目工具取得的输出、耗时和诊断作为本次执行事实，把current Task Verification Report作为Workspace-local Task fact。Skill MUST不将三者合并成一个schema，也 MUST不把完整执行输出或本机路径写入Report。

#### Scenario: command execution 成功
- **WHEN** Agent依据测试地图直接执行显式项目测试入口
- **THEN** Agent MUST读取真实结果并在开发完成后提炼有意义报告
- **AND** 测试工具自己的资源与清理由对应owner处理

#### Scenario: execution 中断
- **WHEN** 项目runner或Agent operation中断且完整结论未形成
- **THEN** Skill MUST保留已有current Report
- **AND** MUST如实报告本次执行未形成新current

### Requirement: Buildr 产品入口必须路由 v3 Verification authority
Buildr product Skill、task-triage和相关builtin descriptions MUST将测试地图维护、已有测试执行与开发完成报告意图路由到selected `buildr.task-verification/v4` provider，并 MUST不恢复v3 Request/Plan、Candidate reuse或Execution Record流程。

#### Scenario: runtime 发现 Task Verification
- **WHEN** supported Agent runtime完成Buildr sync/render
- **THEN** runtime MUST发现v4 `task-verification` Skill、contract、Project v4 reference/template与binding
- **AND** MUST不同时投射旧v3 contract/reference

### Requirement: 测试建设与 Task Verification 必须使用独立入口
Buildr product Skill、task-triage和builtin descriptions MUST将测试框架设计、测试分层、编排策略和为实现任务开发测试的意图路由到`project-testing`；将Project测试地图维护、已有测试选择/直接执行和current Task Verification Report路由到selected `buildr.task-verification/v4` provider。两个Skill MAY在同一任务中先后使用，但 MUST不互相维护状态、声明provider dependency或接管对方authority。

#### Scenario: 实现完成后补充测试再验证任务
- **WHEN** Agent完成功能实现，需要先开发项目测试，再形成正式Task Verification Report
- **THEN** Agent MUST先使用`project-testing`按项目约定补充适量测试
- **AND** 测试入口稳定后 MUST使用`task-verification`选择并直接执行已有工具，最后保存报告

#### Scenario: runtime 发现两个独立 Skill
- **WHEN** supported Agent runtime完成Buildr sync或render
- **THEN** runtime MUST同时发现`project-testing`与`task-verification`
- **AND** `project-testing` MUST不提供Task Verification capability binding或Result authority

## RENAMED Requirements

- FROM: `Buildr 产品入口必须路由 v3 Verification authority`
- TO: `Buildr 产品入口必须路由 v4 Verification authority`
