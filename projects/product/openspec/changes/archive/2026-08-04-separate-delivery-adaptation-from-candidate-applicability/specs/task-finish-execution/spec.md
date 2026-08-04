## MODIFIED Requirements

### Requirement: Task Finish 必须只接受 finish-ready candidate

进入Task Finish的Candidate MUST由Task Development Application生成并通过current handoff交接；该handoff MUST已闭合Content Target、Task context、verification policy、Planning/Verification/Completion gates与proceed decision。Task Finish MUST NOT执行额外Review、formal Verification、risk decision、Candidate generation或Candidate applicability判断。Development Application报告的内容、context、policy、gate或handoff漂移 MUST退出当前Finish并回到Development；Finish自己的Git conflict只表示机械应用失败或需要语义判断，MUST进入隔离Delivery Adaptation而不得宣称Candidate stale。

#### Scenario: Preflight 发现产品缺陷

- **WHEN** Development Application报告Candidate/handoff不再current
- **THEN** run MUST标记terminal `failed`并返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish中编辑内容、修改decision或补写专业Result

#### Scenario: carrier等价核验失败

- **WHEN** current handoff对应的Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** run MUST blocked并返回`delivery-adaptation-required`或`semantic-review-required`
- **AND** MUST NOT归类为`upstream-candidate-defect`、写Development Receipt或声明任何Development fact stale

#### Scenario: 正式保证发现测试失败

- **WHEN** Development handoff缺少current Verification gate、Result为stale/incomplete，或未形成允许推进的Development decision
- **THEN** Finish MUST在preflight返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish内执行formal Verification、读取Result store或接受风险

### Requirement: Resume 必须由产品根据真实状态生成

Task Finish MUST根据current run、Development handoff、Task Contribution、Delivery Baseline、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。Content Target与handoff仍current的target lease、target race、Delivery Adaptation、retained或cleanup阻塞 MAY在同一run恢复。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan、claimed semantic equivalence或冲突解决结果boolean。

#### Scenario: 目标 ref 前进后的候选恢复

- **WHEN** run在deliver发现`task-finish.target-race`，且调用方提供current product-generated matching resume token
- **THEN** 产品 MUST使旧prepare/verify/deliver/cleanup outputs失效，从prepare读取最新Delivery Baseline并重建隔离carrier
- **AND** Candidate identity/generation、Verification Result、Completion Review、decision与handoff MUST保持不变且`formalVerificationExecutions`保持0

#### Scenario: target race恢复发现冲突或贡献漂移

- **WHEN** 新Delivery Baseline无法机械应用原Task Contribution，但Development handoff仍current
- **THEN** 当前run MUST进入可恢复的`delivery-adaptation-required`而不是terminal Candidate defect
- **AND** MUST保留或重建run-owned carrier，不自动解决冲突或返回Development rebuild

#### Scenario: Delivery Adaptation恢复

- **WHEN** Agent只在匹配run-owned carrier完成适配并持matching resume token恢复
- **THEN** 产品 MUST重新核验ownership、baseline ancestry、source/handoff current、carrier cleanliness与policy-required compatibility checks
- **AND** resume动作本身 MUST NOT充当semantic equivalence evidence

#### Scenario: 暂态条件解除

- **WHEN** run因target lease、retained install或cleanup暂态失败，且再次观察证明handoff与适用carrier未变、条件已解除
- **THEN** matching resume token MAY从最早blocked phase继续
- **AND** 已通过的prepare/verify MUST仅在Development Application仍报告current时复用

#### Scenario: 恢复状态无法证明

- **WHEN** ownership、baseline、source contribution、handoff、cleanliness或compatibility checks任一无法证明
- **THEN** 产品 MUST fail closed保持blocked并生成具体diagnostic
- **AND** MUST NOT push、cleanup原Task Environment或要求Agent手写recovery JSON

### Requirement: Prepare 必须只准备内容等价Delivery Carrier

`prepare` MUST在产品拥有的隔离位置，以最新Delivery Baseline机械形成承载current Development Candidate之Task Contribution的可交付ref。它 MAY使用临时Git index、source snapshot tree、binary patch、detached worktree与carrier commit，但 MUST NOT提交、rebase或改写原Task worktree/index/branch，MUST NOT执行OpenSpec convergence/archive、runtime内容sync、生成资产收敛、语义冲突resolution、Candidate freeze或generation。Clean apply必须记录`deterministic-reuse`；机械失败必须保留run-owned baseline carrier并返回Delivery Adaptation facts。

#### Scenario: 未提交内容形成carrier commit

- **WHEN** exact Candidate source可在最新Delivery Baseline无冲突应用并确定性核验原Task Contribution identity
- **THEN** prepare MUST只在隔离carrier中commit并记录Task Contribution、Delivery Baseline、changed paths、mode/blob与carrier ref
- **AND** reuse mode MUST为`deterministic-reuse`，原Task worktree、Candidate/generation与专业Result保持不变

#### Scenario: 最新基线已前进且贡献等价

- **WHEN** 最新Delivery Baseline不同于原任务基线，但Git应用无冲突且应用后的canonical delta identity等于原Task Contribution
- **THEN** prepare MUST进入verify并复用原handoff
- **AND** reuse mode MUST为`deterministic-reuse`且不得执行formal Verification或Completion Review

#### Scenario: Git apply conflict需要Delivery Adaptation

- **WHEN** 同路径Delivery Baseline变化导致Git apply conflict或需要语义判断
- **THEN** prepare MUST保留匹配run-owned baseline carrier，blocked返回`delivery-adaptation-required`/`semantic-review-required`及exact resume token
- **AND** MUST不自动解决冲突、不cleanup原Task Environment、不修改Development Receipt或原Task worktree

#### Scenario: prepare需要改变source bytes

- **WHEN** Development Application报告Content Target/handoff stale或冻结Task Contribution source漂移
- **THEN** prepare MUST停止并返回Task Development rebuild
- **AND** MUST不把Delivery Adaptation当成新Task Contribution或第二Candidate

### Requirement: Verify 必须只证明handoff与carrier等价

`verify` MUST再次通过Task Development Application检查current handoff与Candidate applicability，并核验隔离carrier ownership、Delivery Baseline、source Task Contribution、carrier cleanliness与适用compatibility checks。Clean apply路径 MUST核验canonical delta identity并记录`deterministic-reuse`；适配路径 MUST记录`agent-reviewed-delivery-adaptation`与确定性Git/check facts，不得声称Buildr已证明语义等价。该阶段 MUST NOT写Task Verification Result、生成Candidate或执行Completion Review，`formalVerificationExecutions` MUST始终为0。

#### Scenario: handoff与carrier仍current

- **WHEN** carrier上的应用delta与原Task Contribution identity完全等价且Development handoff current
- **THEN** verify MUST记录`deterministic-reuse`与handoff/candidate/contribution/baseline/carrier identities
- **AND** MUST不启动formal Verification或Completion Review

#### Scenario: Verification Result在Finish期间变化

- **WHEN** owner Result或declaration变化导致Development handoff失效
- **THEN** verify MUST按Development Application read model停止并返回Task Development
- **AND** Finish MUST不直接检查、修复、覆盖或重新执行Verification

#### Scenario: Agent-reviewed Delivery Adaptation

- **WHEN** Agent完成隔离carrier适配，carrier ownership/baseline/source/handoff仍current且policy-required compatibility checks通过
- **THEN** verify MUST记录`agent-reviewed-delivery-adaptation`、changed paths、mode/blob、tree/head、cleanliness与check evidence
- **AND** MUST NOT把结果描述为Buildr确定性证明语义等价

#### Scenario: carrier贡献不等价

- **WHEN** ownership/baseline漂移、source/handoff stale、carrier dirty或compatibility checks失败
- **THEN** verify MUST fail closed且不得进入deliver
- **AND** MUST不push、不cleanup原Task Environment或伪造reuse evidence

### Requirement: Git Finish 必须区分任务贡献与交付基线

Git-backed Task Finish MUST把任务贡献（Task Contribution）定义为原任务基线tree到冻结Task source snapshot tree的canonical Git delta，把交付基线（Delivery Baseline）定义为prepare时读取的最新远端target commit/tree。Delivery Baseline变化或机械应用冲突 MUST NOT自动改变Development Candidate、generation、Verification Result、Completion Review或handoff。Finish只拥有交付载体可行性与确定性Git/check事实；Candidate applicability只由Task Development拥有。

#### Scenario: 目标分支前进但任务贡献未变

- **WHEN** Candidate freeze后远端target前进，Development handoff current，且原Task Contribution可无冲突应用并得到相同delta identity
- **THEN** Finish MUST以`deterministic-reuse`复用原Candidate/gates/handoff并成功交付cleanup
- **AND** generation不增加且`formalVerificationExecutions`为0

#### Scenario: 同路径变化导致冲突但source未变

- **WHEN** Git apply conflict但Development只读inspect证明原Task source、context、policy与gates未变
- **THEN** Finish MUST返回Delivery Adaptation事实而非Candidate stale
- **AND** Agent可在隔离carrier适配并通过compatibility checks后恢复同一run交付，结果为`agent-reviewed-delivery-adaptation`

#### Scenario: 机械事实不能证明语义安全

- **WHEN** Buildr只观察到路径不重叠、clean apply、Git delta或caller resume
- **THEN** Buildr MUST只记录确定性事实
- **AND** MUST NOT声称业务语义安全或替代Agent、Project与既有verification policy

#### Scenario: 贡献变化或无法证明

- **WHEN** Development报告原Task source/Task Contribution、Task Context、policy或gate漂移
- **THEN** Finish MUST返回Task Development rebuild
- **AND** 只有新的formal Verification、Completion Review、handoff与freeze才可增加generation
