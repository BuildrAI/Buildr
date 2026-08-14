## ADDED Requirements

### Requirement: Retained Finish 必须提供受控的 phase-provider bootstrap recovery

当retained Task Finish Product phase provider自身导致repair Task停止时，Buildr MUST为合格existing run提供显式bootstrap recovery。retained Task Finish Application、Workspace SQLite repository、Execution Record owner、五阶段状态机与Task Environment cleanup handoff MUST继续作为唯一canonical writer与lifecycle owner。Recovery MAY从授权capsule导入Task Finish Product phase-provider模块及其受验证本地依赖闭包，但MUST NOT执行candidate CLI写canonical Workspace。

#### Scenario: Retained provider执行缺陷阻断repair Task

- **WHEN** existing run的primary failure由状态机标记为`origin=product-phase-provider`、phase为`preflight|prepare`，且carrier、lease、equivalence、delivery、prepared completion、completion与cleanup事实均不存在
- **AND** downstream phase未执行，current Development/Environment仍匹配，用户明确授权该run
- **THEN** retained Application MUST保持run与canonical store ownership
- **AND** MAY从run-owned capsule执行修复后的Product phase provider
- **AND** MUST保持同一handoff、Candidate/generation与Content Target

#### Scenario: Failure不在受支持边界

- **WHEN** failure缺少provider origin、属于普通readiness/external/upstream/semantic blocker、位于prepare之后、已有交付副作用，或源于CLI/registry/Application/repository/migration层
- **THEN** bootstrap recovery MUST在capsule side effect与candidate import前fail closed
- **AND** MUST保留原Finish Result与owner-specific recovery边界

### Requirement: Bootstrap recovery必须在Execution Record gate后使用current冻结来源

Retained Application MUST在创建任何recovery resource前，使用current Task Environment与Task Development authority证明run绑定的canonical Workspace、execution root、handoff、Candidate/generation和Content Target仍current。Source MUST是同一Environment的非symlink、clean、committed Git checkout，且MUST与canonical Workspace共享同一Git common directory。只有独立Finish Execution Record open成功后，Application才MAY创建或复用capsule。

#### Scenario: Current clean candidate形成capsule

- **WHEN** 合格run的current Environment checkout为clean committed状态，且重新观察的source content等于冻结Content Target
- **AND** Finish Execution Record open gate成功
- **THEN** retained Application MUST从精确source commit创建或接管唯一deterministic run-owned capsule
- **AND** MUST把capsule绑定到run、handoff、Candidate/generation、Content Target、Environment root、retained controller、source commit/tree、provider digest与显式授权identity

#### Scenario: Record gate或authority检查失败

- **WHEN** Execution Record容量不足，或Environment、Development、Content Target、checkout ownership、cleanliness、commit/tree任一不匹配
- **THEN** recovery MUST在capsule创建、manifest写入、run mutation与candidate import前停止
- **AND** MUST保留原run与Task Environment现场

### Requirement: Bootstrap capsule必须验证完整provider checkout而非单一导出函数

Capsule MUST把authority manifest保存在可执行`source/`外，并使用detached shared-object checkout固定source commit与tree。每次首次import与resume MUST重新验证source HEAD、tree、cleanliness、provider canonical path/digest及manifest identity。CLI MUST NOT接受caller source/module/manifest/tarball，也MUST NOT使用npm pack/install或candidate CLI。规范与产品输出MUST说明ES module import会执行provider模块及其受验证本地依赖闭包，MUST NOT把命名导出描述为sandbox。

#### Scenario: Capsule依赖发生漂移

- **WHEN** provider入口文件未变但capsule中任一tracked依赖、untracked文件、HEAD或tree发生漂移
- **THEN** recovery MUST在module import与canonical mutation前fail closed
- **AND** MUST保留matching run与可审查diagnostic

#### Scenario: 调用方选择可执行代码

- **WHEN** 调用方提供source、module、manifest、tarball或其他executable selector
- **THEN** recovery MUST零capsule副作用拒绝该输入
- **AND** MUST NOT复制、安装、import或执行该内容

### Requirement: Candidate provider必须只取得最小retained runtime façade

Retained Application MUST只向candidate provider传入当前Task Finish Product phase所需的closed allowlist runtime façade，且MUST继续使用retained Structured Store sourceRoot与repository完成全部canonical mutation。Façade MUST NOT通过prototype或其他fallback暴露完整retained runtime。该限制是最小authority边界，不得被描述为对可信candidate Product代码的通用sandbox。

#### Scenario: Candidate provider参与恢复

- **WHEN** retained Application从已验证capsule创建Product phase handlers
- **THEN** handler runtime MUST只包含声明的Task Finish phase dependencies，bootstrap provenance仍只由retained run持有
- **AND** run transition、resume token、Task Record terminal association与SQLite persistence MUST仍由retained Application/repository执行

### Requirement: Bootstrap recovery必须复用同一run并由retained finalizer清理capsule

合格failed phase MAY只在同一run内重置，并MUST把原run status、primary failure与phase attempt保存在bootstrap provenance。合格blocked run MUST保留current Product resume token。后续blocked phase MUST复用同一capsule与token。Candidate provider cleanup handler MUST NOT删除capsule；cleanup phase持久化passed后，retained finalizer MUST原子撤销精确source authority、持久化可恢复的revocation evidence，再提交terminal SQLite state。

#### Scenario: Failed prepare在原run内重置

- **WHEN** prepare是合格terminal provider failure且closed no-side-effect predicate通过
- **THEN** retained Application MAY把同一phase重置为pending并继续同一run
- **AND** MUST保留原failure provenance
- **AND** MUST NOT创建新run、Candidate、Formal Verification、Completion Review或handoff

#### Scenario: Recovery进入普通blocked phase

- **WHEN** authorized provider在preflight/prepare之后返回可恢复blocked result且source authority仍有效
- **THEN** Product MUST保留同一capsule identity并生成same-run exact resume token
- **AND** matching resume MUST重新验证完整capsule后只继续未通过phase

#### Scenario: 撤销前失败

- **WHEN** cleanup phase尚未持久化passed或source rename失败
- **THEN** 完整source authority与manifest MUST保留供same-run resume
- **AND** MUST NOT把capsule误报为removed

#### Scenario: 撤销过程中进程退出

- **WHEN** source已移动到deterministic quarantine但run cleanup evidence尚未持久化
- **THEN** 外置manifest与quarantine identity MUST允许retained finalizer确定性确认authority已撤销、补写tombstone并继续同一run
- **AND** MUST NOT重新import candidate provider或重放cleanup phase

#### Scenario: Terminal finalize失败

- **WHEN** 全部phase已passed且capsule authority已撤销，但terminal SQLite finalize失败
- **THEN** run MUST保持`cleanup_pending`与current Product resume token
- **AND** resume MUST只重试retained resource/terminal finalizer
- **AND** MUST NOT要求capsule存在、重新import provider或重放已通过phase

#### Scenario: Revoked residual回收失败

- **WHEN** source authority已撤销且quarantine递归回收失败
- **THEN** Result MUST记录inert residual attention
- **AND** MUST NOT阻止已成立的Finish terminal state或重放phase

### Requirement: Bootstrap Result必须提供最小可审查provenance

Bootstrap适用时，canonical Finish Result MUST additive记录retained-writer mode、原failure、source commit/tree、provider digest、capsule identity与cleanup/revocation状态，并把`bootstrapRecoveryExecutions`设为1。`manualRecoveryManifests`与`formalVerificationExecutions` MUST保持0。公开compact projection MUST只暴露恢复判断所需的portable identity与状态，MUST NOT暴露transferable writer credential、完整本机路径或caller-authored evidence。

#### Scenario: Bootstrap run返回current Result

- **WHEN** bootstrap recovery完成、blocked或进入terminal-only resume
- **THEN** full与compact Result MUST从同一canonical run事实确定性投影bootstrap provenance与current next action
- **AND** Result MUST保持同一run、Candidate/generation、Content Target与正常Execution Record边界
