## MODIFIED Requirements

### Requirement: 发布版本必须由唯一人工选择集合承载
发布选择 SHALL 使用独立 `selectionId` 绑定明确目标集合及每个包的准确版本，并从维护者明确指定、可由当前 `dev` 证明的准确基线（Baseline）创建。选择 MUST 仅纳入明确有序、保留 `cherry-pick -x` 来源的提交（Commit），MUST NOT 自动跟随后续 `dev`。旧主包默认选择 SHALL 继续使用版本派生的原身份及 `release-<version>`；插件（Plugin）和联合选择 MUST 使用独立命名空间，不能与同版本主包选择碰撞。任何没有开发来源的独立发布元数据 MUST 具有独立、可验证的开发回流证据，现有所有者（Owner）不支持该证据时 MUST 拒绝该条目。

#### Scenario: 从指定dev baseline创建release
- **WHEN** 维护者明确要求为目标包集合从准确 `dev` 提交（Commit）创建选择
- **THEN** 系统 MUST 核验其来源并固定源码、目标及各版本身份
- **AND** 相同选择身份已存在时只能核验复用或报告冲突
- **AND** 创建本机选择 MUST NOT 隐含远端推送、候选（Candidate）执行或公开发布

#### Scenario: dev在创建后继续前进
- **WHEN** `dev` 在选择创建后产生新提交（Commit）
- **THEN** 当前选择源码和来源链 MUST 保持不变
- **AND** 新内容只有在明确选择后才能进入该组合

#### Scenario: 版本材料或候选修复需要进入release
- **WHEN** 版本、发布说明或候选（Candidate）修复尚未正常交付 `dev`
- **THEN** 智能体（Agent）MUST 先通过开发任务交付，再有序选择准确提交（Commit）
- **AND** MUST NOT 直接编辑发布工作树（Worktree）后倒灌开发历史

### Requirement: 发布模块必须保持唯一owner与窄consumer边界
本条既有主包上下文（Context）和完整产品候选（Product Candidate）只用于主包相关证明，MUST NOT 强迫仅插件（Plugin）选择生成主包公开产物（Artifact）。逐包候选（Candidate）、发布事实与恢复继续由各自所有者（Owner）维护；共享选择只组合准确目标事实，不建立第二权威。

`tools/release` MUST只拥有release selection、task correlation、readiness/convergence adapter、post-publication dev provenance reconciliation和checkout-only Git provenance；`verification` MUST继续拥有Product Candidate、verification evidence和唯一tarball。发布模块 MUST不读取Task Development或旧Finish repository，也 MUST不改变Product Candidate模型。

#### Scenario: 模块消费其他owner事实
- **WHEN** release readiness需要任务关联
- **THEN** consumer MUST调用Task Record与Worktree的窄read model并核验真实Git/发布facts
- **AND** MUST不恢复Development/Finish compatibility role或建立旁路store

#### Scenario: 发布后维护部分失败
- **WHEN** Publication已成立但Activation、具体资源cleanup、Diagnostics或dev provenance reconciliation失败
- **THEN** 系统 MUST保留Publication并按失败owner报告恢复动作
- **AND** MUST不需要或恢复legacy Task Finish Application

### Requirement: Release selection 必须从精确 dev baseline 创建
选择 SHALL 按已固定 `selectionId` 创建源码分支（Branch）与生命周期引用（Ref）；旧仅主包默认身份继续使用 `release-<version>` 及 `refs/buildr/release/<version>/`，插件（Plugin）与联合目标使用互不冲突的独立身份。以下版本命名场景（Scenario）保留为旧仅主包路径；其它目标 SHALL 执行同样的来源、清洁检出和引用占用校验。

Release owner MUST在 clean checkout 中从维护者指定且可由 `dev` ref 证明的精确 commit 创建唯一 `release-<version>` branch，并记录 immutable baseline ref。创建 MUST不隐含 remote push、Candidate 或 publication。

#### Scenario: create release collection
- **WHEN** 输入 version、baseline commit 与 `dev` ref 均有效且 branch 不存在
- **THEN** 创建 `release-<version>` 指向 baseline，并写入 `refs/buildr/release/<version>/baseline`
- **AND** inspect read model 返回 baseline/source/tree identity、generation `0` 与空 selection chain

#### Scenario: baseline or branch drift
- **WHEN** baseline 不属于 `dev`、checkout dirty、branch 或 lifecycle ref 已被占用
- **THEN** 操作 MUST fail closed，`effects` MUST为空且不得覆盖已有 ref

### Requirement: Lifecycle state 必须独立、可重建且 fail closed
生命周期（Lifecycle）SHALL 使用已固定选择身份定位引用（Ref）。以下公开标签（Tag）相关条件仅用于已选择主包的发布收尾；仅插件（Plugin）选择 SHALL 消费插件自己的公开原字节事实及受保护 `main` 源码保全，不要求主包标签（Tag）或新版本。联合选择 MUST 在全部已选择逐包事实成立且共享用途结束后清理共享资源；纯源码交付 SHALL 依据其明确目标及受保护历史保全单独结束用途。

Freeze、reopen、abandon和closeout MUST使用独立Git lifecycle refs与current owner facts，并保持幂等、compare-and-swap与授权边界。current freeze或abandon状态 MUST阻止update；只有显式reopen成功后才能继续逐commit update。Closeout MUST区分正式远端`release-<version>`、正式远端Tag、remote-tracking projection与owner-owned本地/中间资源：正式远端Tag MUST保留并核验；正式远端release ref按本轮显式绑定的清理政策处理，无新政策的历史授权保持保留行为；本地release branch、全部selection lifecycle refs、owned worktree、generation carrier与本地同名Tag属于必需清理资源；remote-tracking ref存在 MUST NOT阻止本地清理。

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
- **WHEN** owner明确closeout一个已发布release，正式远端`release-<version>`精确等于冻结release commit，正式远端Tag与Publication evidence匹配，且本地branch、lifecycle refs、owned worktree或本地同名Tag仍存在
- **THEN** closeout MUST保留正式远端Tag，并在显式本地cleanup确认后删除owner可证明的本地branch、全部current/history lifecycle refs、owned worktree与本地同名Tag
- **AND** 本轮授权包含正式远端release ref清理时 MUST先证明源码由官方Tag及main历史保全，再按已观察提交条件删除；已不存在时 MUST幂等成功，存在但漂移或保全失败时 MUST保留
- **AND** remote-tracking projection存在 MUST NOT阻止本地资源清理

#### Scenario: 本地Tag已缺失
- **WHEN** Publication evidence与正式远端Tag匹配，且本地同名Tag已经不存在
- **THEN** closeout MUST把本地Tag返回为`already-cleaned`
- **AND** MUST NOT重复创建、fetch、移动或删除远端Tag

#### Scenario: 本地或远端Tag漂移
- **WHEN** 正式远端Tag与Publication evidence不匹配，或本地同名Tag存在但与正式远端Tag对象不一致
- **THEN** closeout MUST在任何本地/中间资源删除前fail closed并报告expected/actual Tag identity
- **AND** MUST NOT删除、移动或覆盖本地或远端Tag

#### Scenario: abandon and cleanup
- **WHEN** owner明确abandon一个未发布release集合
- **THEN** abandon MUST阻止后续Candidate/update/reopen且保留既有Git/Task事实
- **AND** 未取得独立cleanup授权时 MUST保留本地与远端资源

### Requirement: Candidate source 与 release tree 必须形成不可变匹配
本条准确源码冻结义务 SHALL 适用于各目标对应的候选（Candidate）证明；仅插件（Plugin）源码证明与合入后插件公开候选（Candidate）身份 MUST 分别核验。主包完整证明是否需要 SHALL 按实际源码差异判断，MUST NOT 因未选择主包而跳过受影响的完整检查。

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
本条唯一原字节义务 SHALL 分别作用于每个已选择包的候选（Candidate）；联合选择包含两份独立产物（Artifact），MUST NOT 合并成一个主包产物（Artifact）或重新打包。仅验证受影响主包的源码候选（Candidate）不等于授权公开主包。

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
以下既有主包发布上下文（Context）构造义务 SHALL 仅适用于主包受保护发布。仅插件（Plugin）和联合选择 SHALL 组合 `selectionId`、准确目标及版本、实际差异所需证明、各自原字节和逐包发布指针；MUST NOT 用主包上下文（Context）缺失阻止不依赖它的插件（Plugin）动作，也不能弱化已选择主包的原要求。


Buildr MUST使用唯一closed builder组合release selection、release HEAD/tree、Product Candidate aggregate、冻结artifact、main/dev、Task correlation、matching Worktree evidence、最低充分执行环境观察、exact Node与publish workflow identity。Builder MUST直接读取当前事实并自动组合输入，不要求智能体复制绑定JSON或计算摘要；历史准备绑定仅用于读取兼容，MUST NOT要求重复npm ci形成新绑定。Builder MUST NOT读取Task Environment ready、Plan、Receipt或runtime投影。

#### Scenario: 构造完整dispatch context
- **WHEN** active release Task、matching Worktree、最低充分执行环境观察、Candidate、artifact、Git与Node事实全部current
- **THEN** Release MUST形成不含Environment字段的current context

#### Scenario: 专业事实缺失或漂移
- **WHEN** 任一必需owner fact缺失、stale、schema不受支持或与release source不一致
- **THEN** builder MUST保留可读取的其他owner projection并形成对应finding输入
- **AND** MUST NOT从Task状态、历史stdout、文件路径、caller assertion或旧Environment数据补造缺失成功

### Requirement: Release lifecycle 必须维持唯一协调Task与稳定恢复身份
协调任务（Task）SHALL 按选择身份定位；旧仅主包默认保留 `release-<version>`，其它目标 SHALL 使用独立身份。仅插件（Plugin）选择 MUST 等待插件自身公开事实与适用收尾，不要求主包公开事实。联合选择 MUST 保留逐包事实及恢复身份，在全部已选择发布和必需共享收尾完成前保持同一任务（Task）进行中。以下主包单独场景（Scenario）继续适用原义务。

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
- **WHEN** Publication、matching dev provenance reconciliation与全部必需本地/中间资源closeout均通过，且正式远端release ref已按本轮授权完成保留或安全清理并核验
- **THEN** lifecycle MUST返回`closed`并允许Release Skill完成唯一协调Task
- **AND** 历史授权未包含正式远端release ref删除时 MUST保留其原政策，不自动扩大授权，也不因此阻止Task完成

### Requirement: Release Git owner 必须管理generation carrier与幂等closeout
载体（Carrier）SHALL 由 `selectionId` 与代次（Generation）稳定派生；旧仅主包默认名称继续兼容。以下按主包版本及官方标签（Tag）判断的场景（Scenario）仅适用于主包路径。新目标 MUST 核验同一选择归属、受保护历史及全部已选择包用途；MUST NOT 因一包成功删除另一个包仍需恢复的共享引用（Ref）。

Release Git owner MUST为每个selection generation使用确定性`codex/release-main-<version>-g<generation>` carrier，记录expected commit、remote ref、PR head/base与ownership。已合并且源码历史已保全的carrier缺失时，恢复 MUST复用已合并事实且不重建完成用途的引用。发布成功后，owner MUST按与当前context绑定的清理授权处理本版本carrier；同版本全轮次政策 MUST枚举全部可证明归属的generation。未知owner、ref漂移或活动用途 MUST只阻止对应资源删除，不扩大到其他已证明安全的资源。

#### Scenario: 同version新generation创建PR
- **WHEN** 前一generation的release→main PR已经终结，而current frozen generation具有新的release HEAD/tree
- **THEN** owner MUST创建或复用current generation carrier并只以该carrier创建唯一受保护PR
- **AND** MUST保留正式远端`release-<version>`直到发布完成并拒绝复用旧generation carrier

#### Scenario: carrier closeout重复调用
- **WHEN** 已发布源码与官方标签（Tag）及当前main历史保全，matching carrier已经删除或仍精确指向expected release commit
- **THEN** closeout MUST分别返回`already-cleaned`或条件删除matching carrier并完成远端回读
- **AND** MUST NOT删除其他version或ownership不明branch；其他generation只有匹配同版本全轮次授权且证明归属、保全和无活动用途时才可删除

#### Scenario: 同版本多个历史候选
- **WHEN** 当前发布授权包含同版本全部轮次，早期generation由已发布源码历史重建并匹配实时远端提交
- **THEN** owner MUST清理这些已结束用途的carrier，并逐项报告预期提交、实际效果或保留原因
- **AND** MUST NOT单凭名称前缀或文件树相同推断归属与历史保全

#### Scenario: 已合并carrier被平台删除后继续准备
- **WHEN** 精确源码的完整候选已成功且对应PR已合并，carrier被平台自动删除
- **THEN** prepare MUST核验已有候选和合并历史后继续，不重建carrier、不重新派发候选
- **AND** 尚需新候选执行或尚未合并时 MUST继续创建必要的精确carrier

#### Scenario: 发布成功后再次调用准备入口
- **WHEN** 当前发布意图已有成功或仍在进行的公开发布运行，再次调用prepare
- **THEN** 执行器 MUST进入该发布的恢复路径，不重建已清理的正式或临时引用
- **AND** 失败发布只有在核实不存在公开发布事实后才可重新准备

### Requirement: Release lifecycle必须派生编排与阶段时间线
投射（Projection）SHALL 按选择身份及已选择逐包事实派生；旧主包时间线（Timeline）继续适用。仅插件（Plugin）MUST NOT 等待未选择主包的公开事实；联合选择 SHALL 分别报告两个包的公开、未知和恢复状态，不能由单包成功派生整体完成。

Release lifecycle projection MUST在不增加Task Record字段或旁路workflow store的前提下，组合current selection、Candidate attempts/aggregate、main PR、readiness context、Publication evidence、dev provenance reconciliation、release closeout、Task、Worktree、Preparation与Doctor facts，返回current orchestration action、稳定recovery identity和Release Phase Timeline identity。

#### Scenario: 等待publication授权
- **WHEN** selection、Candidate、main tree与readiness均current且尚无matching Publication
- **THEN** lifecycle MUST返回`awaiting-publication-authorization`、`prepare-dispatch`形成的context/timeline identity和独立`human-decision`等待阶段
- **AND** Task或readiness时间戳 MUST NOT被解释为维护者已经授权

#### Scenario: terminal Task但具体cleanup待恢复
- **WHEN** release facts已经closed且协调Task已no-change completed，但Worktree、具体资源cleanup或Doctor仍blocked
- **THEN** orchestration projection MUST保持Publication、reconciliation、Git closeout和Task completion为已通过并把next action指向对应owner
- **AND** MUST NOT把release lifecycle退回publishing、重开Task或生成新的协调identity

#### Scenario: current generation发生变化
- **WHEN** selection generation、context digest、Candidate aggregate或Publication run发生变化
- **THEN** lifecycle MUST生成新的recovery/timeline identity并拒绝旧generation的dispatch授权与closeout组合
- **AND** 旧Timeline MAY作为外部历史evidence保留，但 MUST NOT成为current lifecycle成功输入

### Requirement: Release selection 必须把 main reconciliation 作为独立 provenance
本条公开版本阻止源码收敛的条件 SHALL 只核验已选择公开包；未选择主包的现有公开版本 MUST NOT 阻止插件（Plugin）源码收敛。其它来源与冲突保护继续适用。

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

### Requirement: Release Git mutation 必须绑定matching Worktree execution root
匹配任务（Task）身份 SHALL 来自固定选择身份，旧主包默认继续为 `release-<version>`。仅插件（Plugin）及联合路径 MUST 绑定自己的唯一协调任务（Task）和提供者（Provider）工作树（Worktree），并执行相同真实仓库、分支（Branch）、提交（Commit）及当前版本核验；MUST NOT 因新目标回退到主检出执行写入。


Release selection、reopen、main coverage/reconciliation与generation carrier准备等checkout-scoped Git mutation MUST只在matching active`release-<version>`Task的provider-owned Worktree中运行。Owner MUST核验canonical Workspace、Task、Worktree evidence、repo root、branch与HEAD；retained primary worktree或caller路径声明 MUST NOT成为执行授权。

#### Scenario: matching release execution root
- **WHEN** active release Task、ready Worktree evidence、release branch与expected HEAD全部匹配
- **THEN** Release Git owner MAY执行对应Git动作

- **AND** result MUST返回Worktree binding identity与实际execution root disposition

#### Scenario: retained workspace被作为repo输入
- **WHEN** 调用方把canonical retained primary worktree作为release mutation repo
- **THEN** Release MUST在任何Git写入前拒绝

- **AND** retained branch、index与working tree MUST保持不变

#### Scenario: Worktree binding漂移
- **WHEN** Task、Worktree evidence、branch或HEAD不再匹配closed binding
- **THEN** owner MUST返回current expected/actual identity与唯一Worktree恢复动作
- **AND** MUST NOT扫描其他worktree、切换执行root或回退到retained controller checkout执行Git mutation

### Requirement: Final release source 必须在 Candidate 前固定
最终源码 SHALL 在任何适用候选（Candidate）前固定；各包证明都 MUST 绑定同一选择准确源码。仅插件（Plugin）来源证明不要求主包公开产物（Artifact），但实际主包或网页变化 MUST 继续消费完整主包证明；合入后公开插件（Plugin）候选（Candidate）另行绑定准确 `main` 来源。

Release lifecycle MUST把完成current main coverage与历史收敛后的generation作为唯一final release source。Freeze history MUST保留pre-reconciliation generation，但Candidate、唯一artifact、carrier、main tree与publication context MUST只绑定final generation；普通dev前进 MUST继续不改变该source。

#### Scenario: pre-reconciliation generation存在历史Candidate
- **WHEN** 旧run绑定pre-reconciliation commit或generation
- **THEN** owner MUST保留其历史evidence但标记为stale
- **AND** MUST NOT把相同tree、成功aggregate或已下载tarball解释为final source current

#### Scenario: final source已固定
- **WHEN** main coverage/reconciliation、selection freeze与Worktree binding均current
- **THEN** 后续完整Candidate MUST只运行在final commit/tree/generation
- **AND** Candidate通过后release source MUST保持不可变直到main merge或由main drift显式产生下一generation

### Requirement: 发布身份链必须只组合当前发布与任务owner事实
本条已有身份链 SHALL 保持主包单独发布的完整原要求。通用选择身份链 SHALL 使用 `selectionId`、目标及各版本、开发来源链、最终源码、实际差异所需候选（Candidate）证明、逐包原字节及发布事实；仅插件（Plugin）MUST NOT 把主包公开标签（Tag）或主包新版本加入必需链，联合各包 MUST 分别消费自己的受保护发布身份。

Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publication dev provenance reconciliation → transaction evidence`作为唯一发布身份链。Task correlation MUST只组合release/support Task Record关系、matching Worktree、真实Git/remote和当前发布owner事实。

#### Scenario: 构造发布任务关联
- **WHEN** release transaction读取Task correlation
- **THEN** MUST不要求Task Development、Task Candidate、Development Handoff、旧Task Finish或self-bootstrap结果
- **AND** Product Candidate source、generation、CI aggregate与唯一tarball MUST保持不变

## ADDED Requirements

### Requirement: 源码交付不得隐含未选择包的新版本
仅插件（Plugin）选择 SHALL 使用其独立版本推进源码核验、冻结及受保护 `main` 纳入，MUST NOT 要求主包新版本或主包版本未公开。实际源码差异影响主包产物（Artifact）时 SHALL 仍执行对应完整候选验证（Candidate Verification），验证现有版本不等于发布该版本。恢复 MUST 核验原目标、版本、源码及选择链，MUST NOT 静默替换选择身份。

#### Scenario: 主包当前版本已经公开
- **WHEN** 维护者只选择插件（Plugin），主包当前版本已公开且未选择主包发布
- **THEN** 源码交付 MUST 不受主包公开状态阻塞
- **AND** 主包公开发布及其标签（Tag）动作 MUST 不被派发

#### Scenario: 同身份输入发生变化
- **WHEN** 恢复请求改变目标包或版本而未形成新的明确选择
- **THEN** 系统 MUST 返回身份冲突并保留原现场
