## MODIFIED Requirements

### Requirement: 产品验证覆盖 Task Finish 收尾契约
Buildr package verification MUST确保`task-finish`作为完整“收尾/交付”意图的唯一内置Skill入口，并继续作为`buildr.task-finish/v1`唯一默认provider发布；正式Task分支required消费`buildr.task-development@2`与`buildr.task-environment/v1`，直接Git或retained metadata-only分支按需把optional `buildr.git-operations/v1`提升为required。验证 MUST通过source/package/runtime parity保护统一入口、正式五阶段adapter与直接Git结果边界，并 MUST拒绝把直接Git结果写成Task lifecycle evidence。

#### Scenario: 校验 Task Finish 随包发布
- **WHEN** Buildr执行package check或runtime parity verification
- **THEN** workspace/package manifests MUST声明enabled、installed的`task-finish`及其current provides/requires，所有runtime MUST投射相同Skill/contract identity
- **AND** `task-finish` description MUST覆盖完整“收尾/交付”意图并在正文按matching Task事实分支
- **AND** Git Operations description MUST只覆盖已选择的单次Git Operation，不得与`task-finish`争抢完整收尾意图

#### Scenario: 校验无 Task 的统一入口
- **WHEN** runtime fixture中当前范围没有匹配的未结束Task且用户要求收尾
- **THEN** verifier MUST证明`task-finish`选择直接Git分支并只调用独立Git Operations
- **AND** MUST证明该分支不创建或修改Task Record、Development、Verification、Candidate、Formal Finish或Environment cleanup事实

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
- **AND** Formal Task Finish MUST只持有carrier/equivalence/delivery/retained activation/cleanup handoff/run恢复事实，不得创建第二份专业Result或顶层Task终态
