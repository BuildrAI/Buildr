## REMOVED Requirements

### Requirement: Agent 必须通过唯一Metadata Publication Skill组合writers与Git Operations
**Reason**: Task current records已成为Workspace SQLite本地事实，不再发布到Git，Metadata Publication Skill及其组合职责必须整体清退。

**Migration**: Task Development、Verification与Review继续通过各自Application维护current state；Git Operations不再接收Task metadata publication consumer。

## MODIFIED Requirements

### Requirement: task-verification Skill 必须作为语义验证入口
Buildr MUST交付`task-verification` Workspace Skill并通过selected `buildr.task-verification/v3` provider工作。Skill MUST理解Task Intent与Development提供的stable Content Target，读取Task scope内Project v2 declarations、选择适用已有能力、取得transient execution evidence、提炼current facts，并只在完整结论形成后调用Task Verification Application record。

#### Scenario: 用户要求验证正式 Task
- **WHEN** 用户或Task Development提供正式Task、明确stable Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Development请求formal Verification
- **WHEN** Task Development提供正式Task、明确Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Finish请求Verification
- **WHEN** Task Finish已经开始消费Development handoff
- **THEN** task-verification MUST不再被Finish路由或调用
- **AND** 任何Verification需求 MUST返回Task Development重新建立stable target

#### Scenario: 普通一次性测试
- **WHEN** 用户只要求运行一条测试且没有正式Task/target identity
- **THEN** Skill MAY执行并报告transient facts
- **AND** MUST NOT创建空Task、伪Content Target或Task Verification Result

### Requirement: Skill 必须区分 Capability Declaration、Execution 与 Result
Skill MUST 把 Project declaration 作为已有能力事实，把完整 stdout/stderr、耗时、资源等待和诊断作为 transient Execution Evidence，把current Result作为Workspace-local Task fact。Skill MUST NOT将三者合并成一个schema，也 MUST NOT把execution summary path写入Result。

#### Scenario: command execution 成功
- **WHEN** Skill 通过 `buildr verification run` 执行显式 command capabilities
- **THEN** Skill MUST读取transient summary并提炼每项capability的current facts
- **AND** 全部 consumer 完成后 MUST 请求 cleanup exact execution boundary

#### Scenario: execution 中断
- **WHEN** runner 或 Agent operation 中断且完整结论未形成
- **THEN** Skill MUST 保留已有 current Result
- **AND** MUST 如实报告本次 transient execution 未形成新 current

### Requirement: P0.4 workflow 不得抢占 Development 或其他专业 authority
`task-verification` MUST NOT创建Candidate/generation、改变Task Record status、决定verification policy或proceed/blocked、接受风险、实现缺失测试或替代Task Review/Environment/业务验收。P0.5 Task Development MUST独占这些consumer decisions并只通过Verification Application read model消费Result。

#### Scenario: 存在 coverage gap
- **WHEN** 当前Content Target缺少能证明所需事实的capability
- **THEN** Skill MUST将gap写入完整Result或会话报告
- **AND** MUST将“是否继续”留给Task Development，同时不得允许risk绕过not-passed事实

## MODIFIED Requirements

### Requirement: OpenSpec Change checklist 必须止于 Change disposition 边界
Buildr-owned OpenSpec propose、update与apply contributions MUST引导Agent只把Change disposition前可完成的实现、知识收敛、验证反馈和archive readiness动作写入`tasks.md`。Contributions MUST NOT把Formal Development、Task Finish、Environment cleanup、Task terminal state或其他只能在archive后发生的Task lifecycle动作写为Change checkbox；convergence/archive MUST在Task Development观察stable Content Target之前完成，Task Finish MUST不拥有或解释Change checklist。

#### Scenario: Agent创建或修订Change计划
- **WHEN** `openspec-propose`或`openspec-update-change`生成或修改`tasks.md`
- **THEN** Buildr contribution MUST要求每个checkbox都能在Change disposition前完成
- **AND** MUST把Formal Verification、Task Candidate、Completion Review、Task Finish、Environment cleanup与Task terminal state留给Change外的Task Development lifecycle

#### Scenario: Agent准备收敛Change
- **WHEN** `openspec-apply-change`完成实现并准备调用`buildr openspec converge`
- **THEN** contribution MUST要求先完成全部Change-owned checkbox并说明convergence/archive属于Development stable Content Target之前的Change处置
- **AND** MUST NOT声称Task Finish调用或拥有convergence/archive

#### Scenario: checklist含有archive后动作
- **WHEN** Agent发现现有checkbox只能在Change converge/archive后完成
- **THEN** Agent MUST在implementation前修订该checkbox而不是让convergence自动勾选或绕过
- **AND** Change仍必须在全部真实Change-owned checkbox完成后才能进入convergence
