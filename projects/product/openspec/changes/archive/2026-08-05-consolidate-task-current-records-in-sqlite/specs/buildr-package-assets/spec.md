## REMOVED Requirements

### Requirement: Buildr package 必须交付Task Metadata Publication资产
**Reason**: Metadata Publication capability已被本机SQLite current-record authority取代，package/runtime不应继续交付dormant provider、contract、binding或helper。

**Migration**: 从package manifest、workspace Skill manifest、runtime projection与静态验证中删除全部publication资产声明和专项检查。

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
- **WHEN** verifier检查required Core、Task Development、Task Environment、Git Operations与Task Finish
- **THEN** Candidate/generation/decision MUST只由Development写入，资源/provider cleanup MUST只由Environment写入，单次Git Operation MUST不选择Finish流程，Task current records MUST只由各自Application写入Workspace SQLite
- **AND** Task Finish MUST只持有carrier/equivalence/delivery/retained activation/cleanup handoff/run恢复事实，不得创建第二份专业Result或顶层Task终态

### Requirement: Package verification 必须保护 OpenSpec checklist 与 lifecycle authority parity
Buildr package、workspace source与rendered runtime MUST投射一致的OpenSpec propose/update/apply contributions，并通过static/contract verification拒绝Task Finish convergence/archive旧authority和post-archive lifecycle checkbox引导。Package verification MUST证明convergence的未完成checklist门禁存在，并 MUST证明current runtime、capability graph和帮助文本不再包含Task Metadata Publication provider、binding或consumer route。

#### Scenario: 校验OpenSpec Component contributions
- **WHEN** verifier检查package source、workspace Component source与rendered OpenSpec Skills
- **THEN** 三者 MUST一致声明Change checklist的pre-disposition边界和未完成项fail-closed要求
- **AND** current assets MUST不包含“Task Finish执行或拥有OpenSpec convergence/archive”的可用路由

#### Scenario: 校验Metadata Publication清退
- **WHEN** verifier扫描package source、workspace/runtime manifests、capability graph、help与executable tests
- **THEN** Task Metadata Publication provider、contract、binding、helper与consumer route MUST全部不存在
- **AND** Task current records MUST不进入Git，且 MUST不新增archive reconciliation、checklist writer或第二份lifecycle状态
