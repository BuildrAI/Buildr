## MODIFIED Requirements

### Requirement: Task Finish 必须只接受 finish-ready candidate

进入Task Finish的Candidate MUST由Task Development Application生成并通过current handoff交接；该handoff MUST已闭合Content Target、Task context、verification policy、Planning/Verification/Completion gates与proceed decision。Task Finish MUST冻结handoff、Candidate、generation与Content Target identity，并在preflight、prepare、verify、deliver及复用阶段输出的resume前，通过Development Application精确断言四项仍等于`observed.currentHandoff`。Task Finish MUST NOT自行遍历历史handoffs判断currentness，也 MUST NOT执行额外Review、formal Verification、risk decision、Candidate generation或Candidate applicability判断。Development Application报告的内容、context、policy、gate或handoff漂移 MUST退出当前Finish并回到Development；Finish自己的Git conflict只表示机械应用失败或需要语义判断，MUST进入隔离Delivery Adaptation而不得宣称Candidate stale。

#### Scenario: Preflight 发现产品缺陷

- **WHEN** Development Application报告Candidate/handoff不再current
- **THEN** run MUST标记terminal `failed`并返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish中编辑内容、修改decision或补写专业Result

#### Scenario: 历史handoff不能使旧run通过

- **WHEN** Development receipt同时保留历史handoff A和current handoff B，而run冻结A
- **THEN** preflight及后续阶段 MUST因精确identity mismatch停止
- **AND** MUST NOT从历史handoffs取回A或从B的Task source形成A的carrier

#### Scenario: carrier等价核验失败

- **WHEN** current handoff对应的Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** run MUST blocked并返回`delivery-adaptation-required`或`semantic-review-required`
- **AND** MUST NOT归类为`upstream-candidate-defect`、写Development Receipt或声明任何Development fact stale

#### Scenario: 正式保证发现测试失败

- **WHEN** Development handoff缺少current Verification gate、Result为stale/incomplete，或未形成允许推进的Development decision
- **THEN** Finish MUST在preflight返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish内执行formal Verification、读取Result store或接受风险

#### Scenario: push前handoff漂移

- **WHEN** prepare或verify已完成后Development形成新的current handoff
- **THEN** deliver MUST在取得target lease或push前停止并使旧阶段复用失效
- **AND** MUST保持零push且保留既有run evidence

### Requirement: Resume 必须由产品根据真实状态生成

Task Finish MUST根据current run、Development handoff、Task Contribution、Delivery Baseline、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。Content Target与handoff仍精确等于run冻结identity的target lease、target race、Delivery Adaptation、retained或cleanup阻塞 MAY在同一run恢复。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan、claimed semantic equivalence或冲突解决结果boolean。若current handoff已变化，只有尚无carrier、lease、delivery、retained或cleanup事实的preflight-only旧run MAY以类型化superseded终结并保留Execution Record；新handoff MUST由新run重新提交并冻结commit message。已有任一上述副作用或恢复事实的旧run MUST保持原identity与现场并返回类型化current-run identity conflict，MUST NOT自动删除、终结或换绑。Cleanup MAY根据已持久化delivery/cleanup facts恢复，MUST NOT因交付后Development形成新handoff而丢弃必要清理。

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

- **WHEN** blocked旧run的handoff已变化，且没有carrier、lease、delivery、retained或cleanup事实
- **THEN** 产品 MUST以`task-finish.development-handoff-superseded`终结旧run并保留Execution Record
- **AND** current handoff的新run MUST要求调用方重新提供commit message并冻结独立message identity

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

## ADDED Requirements

### Requirement: Current run factory 必须拒绝identity冲突

`createFinishRun` MUST在返回同Task已有current run前比较规范化请求identity与existing run identity digest。只有两者完全一致时 MAY幂等复用；不同identity MUST抛出稳定`task_finish.current_run_identity_conflict`，不得静默返回旧run。显式run恢复 MUST同样取得current Development handoff并执行精确identity assertion，不得绕过entry readiness。

#### Scenario: existing run identity相同

- **WHEN** 同Task已有current run且请求的handoff、Candidate、generation、Content Target及其他run identity字段完全一致
- **THEN** factory MAY幂等返回existing run
- **AND** MUST不创建重复Execution Record

#### Scenario: existing run identity不同

- **WHEN** 同Task已有current run但请求identity digest不同
- **THEN** factory MUST抛出`task_finish.current_run_identity_conflict`
- **AND** MUST不返回、修改、删除或换绑existing run

#### Scenario: 显式旧run恢复遇到新handoff

- **WHEN** 调用方显式指定旧run，而current Development handoff已变化
- **THEN** Application MUST执行副作用分级并返回superseded或current-run identity conflict
- **AND** MUST不因显式run ID而跳过Development currentness检查
