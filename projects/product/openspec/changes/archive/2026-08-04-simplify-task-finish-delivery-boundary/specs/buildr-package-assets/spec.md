## MODIFIED Requirements

### Requirement: 产品验证覆盖 Task Finish 收尾契约
Buildr package verification MUST确保`task-finish`作为`buildr.task-finish/v1`唯一默认provider发布，required消费`buildr.task-development@1`与`buildr.task-environment/v1`，只在retained metadata-only handoff optional消费`buildr.git-operations/v1`，并通过source/package/runtime parity保护current五阶段adapter。验证 MUST覆盖current Development Handoff、Task Contribution/Delivery Baseline、run-owned Delivery Carrier、deterministic reuse、Agent-reviewed Delivery Adaptation、target-race exact resume、真实remote readback、适用retained activation、Environment cleanup handoff与`formalVerificationExecutions: 0`。验证 MUST拒绝旧Task Finish writer、旧Verification/Change/Candidate authority输入、旧action/executor/router/schema/binding和与current v2重复的recovery path。

#### Scenario: 校验 Task Finish 随包发布
- **WHEN** Buildr执行package check或runtime parity verification
- **THEN** workspace/package manifests MUST声明enabled、installed的`task-finish`及其current provides/requires，所有runtime MUST投射相同Skill/contract identity
- **AND** 产品入口Buildr Skill MUST将完整任务收尾意图路由到`buildr.task-finish/v1`selected provider，Git Operations description MUST NOT声明完整“收尾”意图

#### Scenario: 校验收尾状态机
- **WHEN** verifier使用真实Task Environment、current Development Handoff与Git remote执行无冲突direct-to-target收尾
- **THEN** 一次canonical CLI invocation MUST连续完成`preflight → prepare → verify → deliver → cleanup`、普通push、远端ref回读与适用retained activation
- **AND** MUST断言`agentProviderCompletions: 0`、`manualRecoveryManifests: 0`、`formalVerificationExecutions: 0`且Candidate/generation/Review/Verification/decision未被Finish修改

#### Scenario: 校验收尾授权边界
- **WHEN** fixtures分别让Delivery Baseline无冲突前进、deliver发生target-race和同路径变化产生Git conflict
- **THEN** verifier MUST证明deterministic reuse、exact-token carrier rebuild与Agent-reviewed Delivery Adaptation都复用current Candidate/handoff且只在run-owned carrier发生
- **AND** MUST NOT把这些路径路由为Development rebuild、自动冲突解决或Formal Verification

#### Scenario: 校验旧authority残留
- **WHEN** package/static/runtime verification扫描current manifests、Skill/contract、CLI help/registry、Application registration、JSON schemas、managed mutations与executable tests
- **THEN** 旧Finish action/writer、`--project|--change`/Verification summary/caller Candidate输入、旧Git capability ids、旧Change convergence routing和并行run/receipt schema residual MUST为零
- **AND** archived Change与明确历史fixture MAY保留旧事实，但 MUST NOT被current runtime、help或默认tests解析为可用入口

#### Scenario: Core 不复制收尾流程
- **WHEN** verifier检查required Core、Task Development、Task Environment、Git Operations、Metadata Publication与Task Finish
- **THEN** Candidate/generation/decision MUST只由Development写入，资源/provider cleanup MUST只由Environment写入，单次Git Operation MUST不选择Finish流程，metadata publication MUST保持独立
- **AND** Task Finish MUST只持有carrier/equivalence/delivery/retained activation/cleanup handoff/run恢复事实，不得创建第二份专业Result或顶层Task终态

## ADDED Requirements

### Requirement: 当前 package 不得为未来 Task Finish adapter 预建选择框架
Buildr package、capability graph、runtime source与verification registry MUST在只有当前Product/Git adapter时保持单一`buildr.task-finish/v1`provider与直接Application registration。没有第二种满足真实consumer、delivery target、equivalence、authorization、cleanup eligibility和独立E2E的adapter时，package MUST NOT新增adapter registry、adapter capability family、plugin selection metadata、Finish Receipt或平行run store。

#### Scenario: 当前 package 解析 capability graph
- **WHEN** doctor或package check解析Task Finish provider与consumer topology
- **THEN** graph MUST只显示current`task-finish`provider及其Development/Environment/optional Git Operations dependencies
- **AND** MUST NOT出现未被真实delivery path消费的adapter selector、provider family或第二Finish authority
