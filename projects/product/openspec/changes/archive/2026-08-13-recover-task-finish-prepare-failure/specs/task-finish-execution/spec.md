## MODIFIED Requirements

### Requirement: Resume 必须由产品根据真实状态生成

Task Finish MUST根据current run、Development handoff、Task Contribution、Delivery Baseline、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。Content Target与handoff仍精确等于run冻结identity的target lease、target race、Delivery Adaptation、retained或cleanup阻塞 MAY在同一run恢复。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan、claimed semantic equivalence或冲突解决结果boolean。若current handoff已变化，只有可证明尚无carrier、lease、delivery、retained、prepared completion或cleanup事实，且只停止于preflight或carrier ownership形成前无resume token的terminal failed prepare的旧run MAY以类型化superseded终结并保留Execution Record；preflight-only blocked旧run MAY保留其preflight resume token。新handoff MUST由新run重新提交并冻结commit message。已有任一上述副作用或恢复事实、prepare为blocked、prepare仍有resume token、后续阶段已经开始或阶段状态无法证明的旧run MUST保持原identity与现场并返回类型化current-run identity conflict，MUST NOT自动删除、终结或换绑。Cleanup MAY根据已持久化delivery/cleanup facts恢复，MUST NOT因交付后Development形成新handoff而丢弃必要清理。

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
- **AND** 已通过的prepare/verify MUST仅在Development Application仍报告精确冻结identity current时复用

#### Scenario: preflight-only旧run安全失效

- **WHEN** blocked或failed旧run的handoff已变化，且只有preflight开始、没有carrier、lease、delivery、retained、prepared completion或cleanup事实
- **THEN** 产品 MUST以`task-finish.development-handoff-superseded`终结旧run并保留Execution Record
- **AND** current handoff的新run MUST要求调用方重新提供commit message并冻结独立message identity；旧run的preflight resume token MUST NOT阻止该安全失效

#### Scenario: carrier形成前prepare失败安全失效

- **WHEN** 旧run的preflight已通过、prepare因`carrier-preparation` terminal failed，verify、deliver和cleanup从未开始，且没有carrier、lease、resume、delivery、retained、prepared completion或cleanup事实
- **THEN** 产品 MUST允许current handoff以新的commit message创建新run，并以`task-finish.development-handoff-superseded`处置旧run
- **AND** MUST保留旧invocation的Execution Record，不重试或换绑旧run

#### Scenario: prepare状态无法证明无副作用

- **WHEN** 旧run在prepare blocked、持有resume token、已有后续阶段attempt、存在owner fact，或failure不是可识别的carrier ownership形成前terminal failure
- **THEN** 产品 MUST返回`task-finish.current-run-identity-conflict`并保留现场
- **AND** MUST NOT因carrier字段为空就自动supersede旧run

#### Scenario: 已有副作用事实的旧run保留现场

- **WHEN** 旧run的handoff已变化，且存在carrier、lease、delivery、retained或cleanup事实
- **THEN** 产品 MUST返回`task-finish.current-run-identity-conflict`并保留run、资源ownership和resume evidence
- **AND** MUST NOT自动删除、终结或把旧run换绑到current handoff

#### Scenario: retained Doctor同identity恢复

- **WHEN** run只因retained Doctor阻塞，且Development精确冻结identity仍current
- **THEN** matching resume token MAY在同一run恢复retained与cleanup
- **AND** MUST不创建新run或要求新的commit message

#### Scenario: 恢复状态无法证明

- **WHEN** ownership、baseline、source contribution、handoff、cleanliness或compatibility checks任一无法证明
- **THEN** 产品 MUST fail closed保持blocked并生成具体diagnostic
- **AND** MUST NOT push、cleanup原Task Environment或要求Agent手写recovery JSON

### Requirement: Prepare 必须只准备内容等价Delivery Carrier

`prepare` MUST在产品拥有的隔离位置，以最新Delivery Baseline机械形成承载current Development Candidate之Task Contribution的可交付ref。Task source snapshot MUST从原任务基线与当前Task工作树精确构造新增、修改和删除后的tree；当前已删除的基线路径 MUST通过临时index表达删除，MUST NOT作为必须在工作树中匹配的Git pathspec。它 MAY使用临时Git index、source snapshot tree、binary patch、detached worktree与carrier commit，但 MUST NOT提交、rebase或改写原Task worktree/index/branch，MUST NOT执行OpenSpec convergence/archive、runtime内容sync、生成资产收敛、语义冲突resolution、Candidate freeze或generation。Clean apply必须记录`deterministic-reuse`；机械失败必须保留run-owned baseline carrier并返回Delivery Adaptation facts。

#### Scenario: 未提交内容形成carrier commit

- **WHEN** exact Candidate source可在最新Delivery Baseline无冲突应用并确定性核验原Task Contribution identity
- **THEN** prepare MUST只在隔离carrier中commit并记录Task Contribution、Delivery Baseline、changed paths、mode/blob与carrier ref
- **AND** reuse mode MUST为`deterministic-reuse`，原Task worktree、Candidate/generation与专业Result保持不变

#### Scenario: 未提交归档重命名进入source snapshot

- **WHEN** Task工作树把已跟踪的active Change目录移入archive，旧路径已经不存在且新路径尚未提交
- **THEN** source snapshot MUST包含旧路径删除和archive路径新增，并可继续形成Task Contribution
- **AND** MUST不修改原Task index、工作树或把旧路径作为必须存在的exact pathspec

#### Scenario: 最新基线已前进且贡献等价

- **WHEN** 最新Delivery Baseline不同于原任务基线，但Git应用无冲突且应用后的canonical delta identity等于原Task Contribution
- **THEN** prepare MUST进入verify并复用原handoff
- **AND** reuse mode MUST为`deterministic-reuse`且不得执行formal Verification或Completion Review

#### Scenario: Git apply conflict需要Delivery Adaptation

- **WHEN** Task Contribution与最新Delivery Baseline发生机械Git conflict，且Development handoff仍current
- **THEN** prepare MUST保留匹配run-owned baseline carrier，blocked返回`delivery-adaptation-required`/`semantic-review-required`及exact resume token
- **AND** MUST不自动解决冲突、不cleanup原Task Environment、不修改Development Receipt或原Task worktree

#### Scenario: prepare需要改变source bytes

- **WHEN** Development Application报告Content Target/handoff stale或冻结Task Contribution source漂移
- **THEN** prepare MUST停止并返回Task Development rebuild
- **AND** MUST不把Delivery Adaptation当成新Task Contribution或第二Candidate
