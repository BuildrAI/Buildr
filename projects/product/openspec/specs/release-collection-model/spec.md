# release-collection-model Specification

## Purpose

定义 `release-<version>` 发布集合、选择 provenance、生命周期、身份链、模块所有权和失败隔离的唯一产品契约。

## Requirements

### Requirement: 发布版本必须由唯一人工选择集合承载
Buildr MUST为每个目标package version使用唯一`release-<version>`承载人工选择的发布集合。该集合 MUST从维护者指定且可由current `dev`证明的精确baseline commit/tree创建，MUST只包含维护者明确选择并以`cherry-pick -x`保留来源的`dev` commits，且 MUST NOT自动追随后续`dev`前进。任何没有`sourceDevCommit`的release-only metadata MUST在进入closeout前具有独立、可验证的dev回流证据；当前owner不支持该证据时 MUST拒绝该entry而非旁路放行。

#### Scenario: 从指定dev baseline创建release
- **WHEN** 维护者明确要求为`<version>`从某个精确`dev` commit创建发布集合
- **THEN** release owner MUST核验该commit属于current `dev` authority并记录commit/tree identity
- **AND** 必须使用唯一`release-<version>` identity，已存在同版本identity时只能核验并复用或报告冲突
- **AND** 创建本地集合 MUST NOT隐含remote push、Candidate执行或公共发布

#### Scenario: dev在创建后继续前进
- **WHEN** `dev`在release集合创建后产生新的commit
- **THEN** current release HEAD/tree和selection chain MUST保持不变
- **AND** 新commit只有在维护者再次明确选择后才可进入该release集合

#### Scenario: 版本材料或候选修复需要进入release
- **WHEN** package version、CHANGELOG、README或Candidate修复尚未形成可由current `dev`证明的delivered commit
- **THEN** Agent MUST先通过窄support Task把改动交付`dev`，再把该source commit以`cherry-pick -x`选择到release
- **AND** MUST NOT直接在release worktree修改后把整条release历史合并或倒灌`dev`

### Requirement: Release更新必须保留逐commit provenance并在冲突时停止
Release owner MUST只对维护者明确列出的`dev` source commits按明确顺序执行带`-x` provenance的最小cherry-pick。每个source、结果release commit、changed paths和顺序 MUST可由closed selection read model重建；冲突、source漂移或授权不足 MUST在后续成功commit、remote update和公共副作用前失败关闭。

#### Scenario: 纳入一个指定dev commit
- **WHEN** 维护者明确选择一个current `dev` commit加入未冻结的`release-<version>`
- **THEN** release owner MUST对该commit执行`cherry-pick -x`并核验结果commit/tree与provenance trailer
- **AND** read model MUST区分source dev commit、result release commit和release generation
- **AND** MUST NOT顺带纳入未选择的ancestor、descendant或最新`dev`内容

#### Scenario: cherry-pick发生冲突
- **WHEN** 指定commit不能干净应用到current release HEAD
- **THEN** release owner MUST停止后续选择与remote update并报告冲突paths、source和pre-operation release identity
- **AND** MUST NOT自动解决、直接编辑、rebase、reset、force push或把部分现场报告为完整成功

### Requirement: Release生命周期动作必须独立授权且幂等
Release create、update、freeze、reopen、abandon和cleanup MUST分别核验current identity、owner与授权，MUST报告实际effects，且 MUST NOT将一个动作的授权扩大为另一个动作。重复调用只有在输入和live facts等价时才可返回幂等成功；共享ref删除和远端release branch cleanup MUST始终要求独立明确授权。

#### Scenario: 冻结current release
- **WHEN** 维护者要求对current release HEAD/tree形成Candidate
- **THEN** freeze MUST返回selection chain、release commit/tree、generation与历史freeze identity，并准确报告本地lifecycle ref effects
- **AND** release内容变化 MUST使旧freeze、Candidate、artifact、readiness和transaction context stale

#### Scenario: 重新打开失败Candidate对应的冻结集合
- **WHEN** 维护者已经从GitHub、Git tag、npm registry与protected workflow current facts确认尚无公开或不可逆publication，并明确授权重新打开current frozen release
- **THEN** release workflow MUST独立调用reopen，selection owner MUST核验current identity与显式confirmation/reason、保留历史freeze ref并释放current freeze
- **AND** reopen MUST不隐含update、remote push、Candidate执行、Task状态变化或公共发布副作用

#### Scenario: 已存在公开发布事实
- **WHEN** 目标version/tag/GitHub Release已经存在，或matching protected transaction已经开始tag、npm或GitHub Release公共mutation
- **THEN** release workflow MUST拒绝reopen并要求选择新version
- **AND** selection owner MUST NOT通过caller提交的publication布尔值、历史stdout或Task completed状态补造安全证明

#### Scenario: 放弃未发布集合
- **WHEN** 维护者明确放弃某个尚未公开发布的release集合
- **THEN** abandon MUST保留Task、Verification、Finish和Git已有事实并阻止该集合继续进入Candidate/publication
- **AND** MUST NOT自动删除local/remote ref或伪造cleanup成功

#### Scenario: 清理远端release branch
- **WHEN** 公开发布与恢复价值已核验完成且remote release ref仍存在
- **THEN** owner MUST展示精确ref、commit与已成立发布事实并等待独立删除授权
- **AND** 未获授权、ref漂移或ownership不可证明时 MUST保留remote ref

### Requirement: 发布身份链必须只组合current owner facts
Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publication dev provenance reconciliation → transaction evidence`作为唯一发布身份链。每个节点 MUST由其专业owner形成current identity或portable read model；下游 MUST只引用最低充分identity/digest，不得复制专业Result正文、caller-claimed success或历史stdout。关联release/support Tasks、Task Environment、Task Development handoff、Task Contribution、Task Finish Delivery、Execution Record与matching self-bootstrap Activation时，release consumer MUST通过唯一组合器形成稳定的release evidence carrier与transaction context identity；该组合器 MUST只保存owner references、identity、digest、status和诊断引用，不得建立旁路SQLite authority或复制专业Result。

#### Scenario: release内容变化
- **WHEN** current release HEAD或tree不等于Candidate、artifact、readiness或transaction context保存的source
- **THEN** 所有下游evidence MUST标记stale或blocked并拒绝进入tag/npm mutation
- **AND** Buildr MUST形成新的matching Candidate generation和唯一tarball，不得拼接旧run证据

#### Scenario: 关联Task与发布事实
- **WHEN** release transaction需要关联release/support Tasks、Environment、Development、Finish与self-bootstrap
- **THEN** correlation MUST从各Application的current read model和真实Git/GitHub/npm facts构造closed context
- **AND** correlation MUST返回唯一carrier/context identity、参与的owner references与digests、source tree/remote identities和可定位的Execution Record/diagnostic refs
- **AND** 自动Finish、直接Git/PR后的Finish reconcile与matching self-bootstrap MUST映射为同形的evidence roles
- **AND** Task Record MUST继续只保存既有顶层、Parent与retrospective关系
- **AND** MUST NOT新增release旁路SQLite slot、复制Result或接受caller提交的完成结论

#### Scenario: 证据缺失或跨运行
- **WHEN** 任一必需 owner read model 缺失、stale、schema 不受支持、跨 run 或与 source/carrier digest 不一致
- **THEN** correlation MUST返回结构化 `blocked` 或 `unknown` finding、保留缺失/冲突的 owner reference 与 next action
- **AND** consumer MUST NOT把该 context 当作 release readiness 或 protected transaction 的通过证据
- **AND** correlation MUST NOT从历史 stdout、Task Record 状态、文件路径或 caller assertion 猜测缺失事实

#### Scenario: Delivery 已成立但后续维护失败
- **WHEN** Finish Delivery 已由真实 remote/readback 确认，但 self-bootstrap Activation、Environment Cleanup 或 Diagnostics 尚未成立
- **THEN** carrier MUST保留独立的 Delivery evidence role 为 current
- **AND** Activation、Cleanup 与 Diagnostics MUST分别返回其自身的 blocked/attention/unknown 状态
- **AND** correlation MUST NOT撤销或改写已经成立的 Delivery identity

#### Scenario: portable read model 输出
- **WHEN** release consumer 请求关联结果
- **THEN** 输出 MUST包含 schema/version、carrier/context identity、evidence roles、overall status、owner references/digests、source identities、diagnostic refs和next actions
- **AND** 输出 MUST NOT嵌入专业Result正文、完整stdout、attempt history、本地SQLite路径或 caller 提交的完成布尔值

### Requirement: 发布模块必须保持唯一owner与窄consumer边界
`tools/release` MUST只拥有release selection、readiness/convergence adapter、post-publication dev provenance reconciliation和checkout-only Git provenance；`system/installation` MUST拥有SemVer、package/version、release track与installation identity；`verification` MUST拥有Product Candidate、verification evidence和唯一tarball；`task` MUST拥有Task/Environment/Development/Verification/Finish/Execution Record/Parent事实；self-bootstrap runner MUST只拥有matching retained Activation与Diagnostics；Bootstrap MUST是唯一composition root；protected publish workflow MUST独占tag、npm、dist-tag、GitHub Release与Registry readback公共mutation。

#### Scenario: 模块消费其他owner事实
- **WHEN** release readiness、Candidate或transaction需要其他模块的数据
- **THEN** consumer MUST调用该owner的窄公开read model并核验identity/currentness
- **AND** MUST NOT跨模块直接写persistence、复制业务规则、恢复旧全局入口或建立第二composition root

#### Scenario: 发布后维护部分失败
- **WHEN** Publication已成立但Activation、Environment Cleanup、Diagnostics、dev provenance reconciliation或release branch cleanup失败
- **THEN** 系统 MUST保留已成立的Delivery与Publication事实并按失败owner独立报告恢复动作
- **AND** 任一维护失败 MUST NOT删除tag、unpublish npm、覆盖GitHub Release或反向改写其他owner的成功事实

### Requirement: Release selection 必须从精确 dev baseline 创建
Release owner MUST在 clean checkout 中从维护者指定且可由 `dev` ref 证明的精确 commit 创建唯一 `release-<version>` branch，并记录 immutable baseline ref。创建 MUST不隐含 remote push、Candidate 或 publication。

#### Scenario: create release collection
- **WHEN** 输入 version、baseline commit 与 `dev` ref 均有效且 branch 不存在
- **THEN** 创建 `release-<version>` 指向 baseline，并写入 `refs/buildr/release/<version>/baseline`
- **AND** inspect read model 返回 baseline/source/tree identity、generation `0` 与空 selection chain

#### Scenario: baseline or branch drift
- **WHEN** baseline 不属于 `dev`、checkout dirty、branch 或 lifecycle ref 已被占用
- **THEN** 操作 MUST fail closed，`effects` MUST为空且不得覆盖已有 ref

### Requirement: Release update 必须只纳入明确选择的 cherry-pick -x commit
Update MUST按调用方给出的单个 source commit 执行 `git cherry-pick -x`，并从结果 commit 的 trailer 重建 ordered selection chain。普通 `dev` 前进、未选择的 ancestor/descendant 或已选 commit MUST不改变 release。

#### Scenario: selected commit succeeds
- **WHEN** source commit 是当前 `dev` 的后代、在 baseline 之后且尚未纳入
- **THEN** 产生一个 release commit，read model 区分 source dev commit、result release commit、changed paths 与递增 generation
- **AND** 不产生 remote 或公共 effects

#### Scenario: cherry-pick conflicts or source drifts
- **WHEN** source 无法干净应用、已漂移、已选择或工作区不 clean
- **THEN** MUST停止且返回 source、pre-operation release HEAD、conflict paths 和精确 abort/recovery action
- **AND** MUST不自动解决、继续选择、reset、rebase、force push 或报告部分成功

### Requirement: Lifecycle state 必须独立、可重建且 fail closed
Freeze、reopen、abandon和closeout MUST使用独立Git lifecycle refs与current owner facts，并保持幂等、compare-and-swap与授权边界。current freeze或abandon状态 MUST阻止update；只有显式reopen成功后才能继续逐commit update。Closeout MUST区分正式远端`release-<version>`、remote-tracking projection与owner-owned本地/中间资源：正式远端release ref默认保留并核验，本地release branch、全部selection lifecycle refs、owned worktree与generation carrier属于必需清理资源；remote-tracking ref存在 MUST NOT阻止本地清理。

#### Scenario: freeze and inspect
- **WHEN** open集合被要求 freeze
- **THEN** owner MUST写入current frozen ref与不可变`freezes/<generation>`历史ref，并返回包含按generation排序`freezeHistory`的stable selection identity；重复 freeze 在HEAD和历史ref未变时幂等成功
- **AND** branch内容变化、current frozen ref与HEAD不一致或历史generation ref漂移时read model MUST标记stale或blocked

#### Scenario: reopen current freeze
- **WHEN** current selection为frozen、worktree clean且维护者提供显式confirmation与非空reason
- **THEN** owner MUST确保当前generation历史freeze不可变保存，再按expected commit删除current frozen ref并返回`ready`
- **AND** update仍需后续独立授权；旧Candidate、artifact、readiness与transaction context MUST因current selection status/identity变化而stale

#### Scenario: reopen遇到ref竞争或错误状态
- **WHEN** selection不是current frozen、历史freeze ref指向其他commit、current frozen ref漂移、worktree dirty或confirmation/reason缺失
- **THEN** reopen MUST fail closed并报告current facts与已发生effects
- **AND** MUST NOT继续update、移动remote branch、删除历史freeze或自动改变策略

#### Scenario: 正式远端release ref存在时清理本地资源
- **WHEN** owner明确closeout一个已发布release，正式远端`release-<version>`精确等于冻结release commit，且本地branch、lifecycle refs或owned worktree仍存在
- **THEN** closeout MUST保留正式远端release ref，并在显式本地cleanup确认后删除owner可证明的本地branch、全部current/history lifecycle refs与owned worktree
- **AND** remote-tracking projection存在 MUST NOT阻止本地资源清理

#### Scenario: abandon and cleanup
- **WHEN** owner明确abandon一个未发布release集合
- **THEN** abandon MUST阻止后续Candidate/update/reopen且保留既有Git/Task事实
- **AND** 未取得独立cleanup授权时 MUST保留本地与远端资源

### Requirement: Candidate source 与 release tree 必须形成不可变匹配
Candidate workflow MUST 接受精确 release ref/SHA，在 admission 时解析 commit identity 与 tree identity，并将二者作为 current Candidate source；后续 shard、aggregate 与 publish consumer MUST 拒绝只凭可变 ref 重建 source。

#### Scenario: release HEAD 进入 Candidate admission
- **WHEN** maintainer 为 release-<version> 请求 Candidate
- **THEN** workflow MUST 保存解析后的 commit/tree identity、release ref、Candidate generation 与 registry identity
- **AND** 任一后续 consumer MUST 使用该冻结 source，而不是重新读取 release ref

#### Scenario: release 内容变化使旧 Candidate 失配
- **WHEN** release HEAD 的 commit 或 tree identity 与 current Candidate source 不同
- **THEN** workflow MUST 创建新的 Candidate generation
- **AND** 旧 generation 的 shard、aggregate 与 artifact evidence MUST 不再被接受

### Requirement: 唯一 artifact 必须由 Candidate 冻结并可回读
Candidate packaging MUST 只生成一个带 source identity、Candidate generation、package version、文件 manifest 与 bytes integrity 的 publishable tarball；所有验证和 publish consumer MUST 复用该 artifact identity。

#### Scenario: Candidate 生成唯一 tarball
- **WHEN** Candidate packaging 对 current source 成功
- **THEN** registry MUST 记录唯一 tarball locator、manifest digest 与 bytes digest
- **AND** repeated consumer request MUST 返回同一 artifact identity

#### Scenario: consumer 试图生成第二份 tarball
- **WHEN** publish 或 shard consumer 没有 matching frozen artifact 或尝试重新 pack
- **THEN** consumer MUST fail closed
- **AND** workflow MUST 不产生第二份 publishable bytes

### Requirement: 共享 Release Context 必须只组合current owner facts
Buildr MUST使用唯一closed builder组合release selection、release HEAD/tree、Product Candidate aggregate、冻结artifact、main/dev、Task correlation、Task Environment、exact Node与publish workflow identity。Builder MUST只保存最低充分owner projection、portable locator与identity/digest，不得复制专业Result正文、stdout、caller-claimed success或旁路persistence。

#### Scenario: 构造完整dispatch context
- **WHEN** selection、Candidate、artifact、main、Task correlation、Environment、Node与workflow facts均可读取
- **THEN** builder MUST返回closed release context、稳定context digest和每个owner的current identity
- **AND** 相同规范化输入 MUST产生相同digest，任一owner identity变化 MUST产生不同digest

#### Scenario: 专业事实缺失或漂移
- **WHEN** 任一必需owner fact缺失、stale、schema不受支持或与release source不一致
- **THEN** builder MUST保留可读取的其他owner projection并形成对应finding输入
- **AND** MUST NOT从Task状态、历史stdout、文件路径或caller assertion补造缺失成功

### Requirement: Release Readiness 必须分阶段collect-all且无副作用
Buildr MUST让`pre-candidate`、`pre-main`、`dispatch-check`与hosted`pre-tag`使用同一context schema、currentness规则和finding codes。每个本地Readiness Result MUST返回stage、context identity、`ready|blocked`、全部findings、hosted deferred checks、next actions与`effects: []`；不得因首个失败丢弃其他finding。

#### Scenario: 本地候选准备检查
- **WHEN** 维护者在`pre-candidate`、`pre-main`或`dispatch-check`运行readiness
- **THEN** evaluator MUST完成所有适用只读检查并按owner输出全部finding
- **AND** OIDC、Environment approval、run/attempt与公共Registry mutation检查 MUST列为hosted deferred checks
- **AND** MUST NOT dispatch workflow、请求审批、创建tag、publish npm或修改GitHub Release

#### Scenario: 冻结dispatch context
- **WHEN** `dispatch-check`的全部本地必需检查通过
- **THEN** Result MUST把完整context标记为frozen并输出唯一context digest
- **AND** hosted workflow MUST逐字节消费并重新计算同一digest，不得接受后续重建的近似context

### Requirement: Release lifecycle 必须维持唯一协调Task与稳定恢复身份
Buildr MUST从current release owner facts派生version-scoped lifecycle read model，并 MUST让同一`release-<version>`协调Task从selection持续保持active到Publication、post-publication dev provenance reconciliation与必需closeout完成。阶段与恢复身份 MUST绑定version、Task ID、selection generation/identity、frozen context digest和适用publish run，不得写入Task Record新状态字段或建立旁路workflow store。

#### Scenario: readiness完成并等待publication授权
- **WHEN** Candidate、唯一artifact、release→main tree equality与无副作用readiness全部current，但维护者尚未授权publication
- **THEN** lifecycle MUST返回`awaiting-publication-authorization`并保持同一release Task active
- **AND** MUST NOT完成Task、创建第二协调Task或把历史授权当作当前publication授权

#### Scenario: Candidate或publication暂态失败
- **WHEN** 同一version的Candidate失败、同SHA job暂态失败或protected transaction需要同context恢复
- **THEN** lifecycle MUST保留同一Task与匹配generation/context recovery identity
- **AND** support修复 MAY独立交付，但 MUST NOT成为新的release协调Task

#### Scenario: 必需closeout全部完成
- **WHEN** Publication、matching dev provenance reconciliation与全部必需本地/中间资源closeout均通过，且正式远端release ref已按默认保留策略精确核验
- **THEN** lifecycle MUST返回`closed`并允许Release Skill完成唯一协调Task
- **AND** 可选的正式远端release ref删除未获授权 MUST NOT阻止Task完成

### Requirement: Release Git owner 必须管理generation carrier与幂等closeout
Release Git owner MUST为每个selection generation使用确定性`codex/release-main-<version>-g<generation>` carrier，记录expected commit、remote ref、PR head/base与ownership，并在main tree等价后枚举和删除owner可证明的本地/远端carrier。未知owner、ref漂移或多个不匹配PR MUST在删除或新PR mutation前失败关闭。

#### Scenario: 同version新generation创建PR
- **WHEN** 前一generation的release→main PR已经终结，而current frozen generation具有新的release HEAD/tree
- **THEN** owner MUST创建或复用current generation carrier并只以该carrier创建唯一受保护PR
- **AND** MUST保留正式远端`release-<version>`并拒绝复用旧generation carrier

#### Scenario: carrier closeout重复调用
- **WHEN** main tree已等于冻结release tree且matching carrier已经删除或仍精确指向expected release commit
- **THEN** closeout MUST分别返回`already-cleaned`或删除matching carrier并完成remote readback
- **AND** MUST NOT删除正式release ref、其他generation或ownership不明branch

### Requirement: Release lifecycle必须派生编排与阶段时间线
Release lifecycle projection MUST在不增加Task Record字段或旁路workflow store的前提下，组合current selection、Candidate attempts/aggregate、main PR、readiness context、Publication evidence、dev provenance reconciliation、release closeout、Task、Environment与Doctor facts，返回current orchestration action、稳定recovery identity和Release Phase Timeline identity。

#### Scenario: 等待publication授权
- **WHEN** selection、Candidate、main tree与readiness均current且尚无matching Publication
- **THEN** lifecycle MUST返回`awaiting-publication-authorization`、`prepare-dispatch`形成的context/timeline identity和独立`human-decision`等待阶段
- **AND** Task或readiness时间戳 MUST NOT被解释为维护者已经授权

#### Scenario: terminal Task但Environment cleanup待恢复
- **WHEN** release facts已经closed且协调Task已no-change completed，但Environment cleanup或Doctor仍blocked
- **THEN** orchestration projection MUST保持Publication、reconciliation、Git closeout和Task completion为已通过并把next action指向对应cleanup/Doctor owner
- **AND** MUST NOT把release lifecycle退回publishing、重开Task或生成新的协调identity

#### Scenario: current generation发生变化
- **WHEN** selection generation、context digest、Candidate aggregate或Publication run发生变化
- **THEN** lifecycle MUST生成新的recovery/timeline identity并拒绝旧generation的dispatch授权与closeout组合
- **AND** 旧Timeline MAY作为外部历史evidence保留，但 MUST NOT成为current lifecycle成功输入

### Requirement: Release selection 必须把 main reconciliation 作为独立 provenance
Release selection MUST继续只从精确 dev baseline 和明确 `cherry-pick -x` source commits 构建；为解决当前 main 漂移而产生的 merge commit MUST作为独立 reconciliation provenance 记录，MUST NOT伪装成 `sourceDevCommit`，且 MUST绑定前一 frozen selection、main parent、release parent、resolution identity 和新 generation。

#### Scenario: 记录 main reconciliation
- **WHEN** frozen selection 为了进入当前 main 需要解决冲突并产生 merge commit
- **THEN** selection read model MUST保留原 baseline 与 ordered source chain
- **AND** MUST追加独立 reconciliation entry，包含 main parent、release parent、post commit/tree、resolution identity 和 generation

#### Scenario: reconciliation 后继续读取 selection
- **WHEN** consumer 请求新的 release selection
- **THEN** owner MUST同时返回 dev selection provenance 与 main reconciliation provenance
- **AND** MUST拒绝把 reconciliation commit作为可再次 cherry-pick 的 dev source

#### Scenario: reconciliation 失败
- **WHEN** 冲突未解决、main/ref identity 漂移或目标版本已有公开发布事实
- **THEN** selection owner MUST返回 fail-closed finding 和 pre-operation identity
- **AND** MUST不移动 frozen ref、覆盖 release branch 或递增 generation

### Requirement: Release Git mutation 必须绑定matching Task Environment execution root
Release selection、reopen、main coverage/reconciliation与generation carrier准备等checkout-scoped Git mutation MUST只在matching active `release-<version>`协调Task的ready Task Environment execution root中运行。Consumer MUST从Environment read model构造closed binding，owner MUST独立核验canonical Workspace、Task、worktree provider evidence、repo root、branch、HEAD与runtime/controller identity；retained primary worktree和caller提交的路径声明 MUST NOT成为执行授权。

#### Scenario: matching release execution root
- **WHEN** active release Task、ready Environment、provider-owned worktree、release branch与expected HEAD全部匹配
- **THEN** owner MAY执行已单独授权的selection或reconciliation Git mutation
- **AND** result MUST返回Environment binding identity与实际execution root disposition

#### Scenario: retained workspace被作为repo输入
- **WHEN** 调用方把canonical retained primary worktree传给release Git owner
- **THEN** owner MUST在checkout、merge、commit、ref mutation或remote push前失败关闭
- **AND** retained branch、index与working tree MUST保持不变

#### Scenario: Environment binding漂移
- **WHEN** Task、Receipt、worktree provider evidence、branch或HEAD不再匹配closed binding
- **THEN** owner MUST返回current expected/actual identity与唯一Environment恢复动作
- **AND** MUST NOT扫描其他worktree、切换执行root或回退到retained controller checkout执行Git mutation

### Requirement: Final release source 必须在 Candidate 前固定
Release lifecycle MUST把完成current main coverage与历史收敛后的generation作为唯一final release source。Freeze history MUST保留pre-reconciliation generation，但Candidate、唯一artifact、carrier、main tree与publication context MUST只绑定final generation；普通dev前进 MUST继续不改变该source。

#### Scenario: pre-reconciliation generation存在历史Candidate
- **WHEN** 旧run绑定pre-reconciliation commit或generation
- **THEN** owner MUST保留其历史evidence但标记为stale
- **AND** MUST NOT把相同tree、成功aggregate或已下载tarball解释为final source current

#### Scenario: final source已固定
- **WHEN** main coverage/reconciliation、selection freeze与Environment binding均current
- **THEN** 后续完整Candidate MUST只运行在final commit/tree/generation
- **AND** Candidate通过后release source MUST保持不可变直到main merge或由main drift显式产生下一generation
