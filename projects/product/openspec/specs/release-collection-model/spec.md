# release-collection-model Specification

## Purpose

定义 `release-<version>` 发布集合、选择 provenance、生命周期、身份链、模块所有权和失败隔离的唯一产品契约。

## Requirements

### Requirement: 发布版本必须由唯一人工选择集合承载
Buildr MUST为每个目标package version使用唯一`release-<version>`承载人工选择的发布集合。该集合 MUST从维护者指定且可由current `dev`证明的精确baseline commit/tree创建，MUST只包含维护者明确选择的`dev` commits和同版本明确授权的release-only metadata，并 MUST NOT自动追随后续`dev`前进。

#### Scenario: 从指定dev baseline创建release
- **WHEN** 维护者明确要求为`<version>`从某个精确`dev` commit创建发布集合
- **THEN** release owner MUST核验该commit属于current `dev` authority并记录commit/tree identity
- **AND** 必须使用唯一`release-<version>` identity，已存在同版本identity时只能核验并复用或报告冲突
- **AND** 创建本地集合 MUST NOT隐含remote push、Candidate执行或公共发布

#### Scenario: dev在创建后继续前进
- **WHEN** `dev`在release集合创建后产生新的commit
- **THEN** current release HEAD/tree和selection chain MUST保持不变
- **AND** 新commit只有在维护者再次明确选择后才可进入该release集合

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
Release create、update、freeze、abandon和cleanup MUST分别核验current identity、owner与授权，MUST报告实际effects，且 MUST NOT将一个动作的授权扩大为另一个动作。重复调用只有在输入和live facts等价时才可返回幂等成功；共享ref删除和远端release branch cleanup MUST始终要求独立明确授权。

#### Scenario: 冻结current release
- **WHEN** 维护者要求对current release HEAD/tree形成Candidate
- **THEN** freeze MUST返回selection chain、release commit/tree和generation的稳定identity且effects为空
- **AND** release内容变化 MUST使旧freeze、Candidate、artifact、readiness和transaction context stale

#### Scenario: 放弃未发布集合
- **WHEN** 维护者明确放弃某个尚未公开发布的release集合
- **THEN** abandon MUST保留Task、Verification、Finish和Git已有事实并阻止该集合继续进入Candidate/publication
- **AND** MUST NOT自动删除local/remote ref或伪造cleanup成功

#### Scenario: 清理远端release branch
- **WHEN** 公开发布与恢复价值已核验完成且remote release ref仍存在
- **THEN** owner MUST展示精确ref、commit与已成立发布事实并等待独立删除授权
- **AND** 未获授权、ref漂移或ownership不可证明时 MUST保留remote ref

### Requirement: 发布身份链必须只组合current owner facts
Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publish dev convergence → transaction evidence`作为唯一发布身份链。每个节点 MUST由其专业owner形成current identity或portable read model；下游 MUST只引用最低充分identity/digest，不得复制专业Result正文、caller-claimed success或历史stdout。关联release/support Tasks、Task Environment、Task Development handoff、Task Contribution、Task Finish Delivery、Execution Record与matching self-bootstrap Activation时，release consumer MUST通过唯一组合器形成稳定的release evidence carrier与transaction context identity；该组合器 MUST只保存owner references、identity、digest、status和诊断引用，不得建立旁路SQLite authority或复制专业Result。

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
`tools/release` MUST只拥有release selection、readiness/convergence adapter和checkout-only Git provenance；`system/installation` MUST拥有SemVer、package/version、release track与installation identity；`verification` MUST拥有Product Candidate、verification evidence和唯一tarball；`task` MUST拥有Task/Environment/Development/Verification/Finish/Execution Record/Parent事实；self-bootstrap runner MUST只拥有matching retained Activation与Diagnostics；Bootstrap MUST是唯一composition root；protected publish workflow MUST独占tag、npm、dist-tag、GitHub Release与Registry readback公共mutation。

#### Scenario: 模块消费其他owner事实
- **WHEN** release readiness、Candidate或transaction需要其他模块的数据
- **THEN** consumer MUST调用该owner的窄公开read model并核验identity/currentness
- **AND** MUST NOT跨模块直接写persistence、复制业务规则、恢复旧全局入口或建立第二composition root

#### Scenario: 发布后维护部分失败
- **WHEN** Publication已成立但Activation、Environment Cleanup、Diagnostics、dev convergence或release branch cleanup失败
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
Freeze、abandon、cleanup MUST使用独立 Git lifecycle refs，并保持幂等与授权边界。冻结或放弃后不得继续 update；cleanup MUST只清理本地资源，发现 remote matching ref 时必须拒绝。

#### Scenario: freeze and inspect
- **WHEN** 未冻结集合被要求 freeze
- **THEN** 写入 frozen ref 并返回 stable selection identity；重复 freeze 在 HEAD 未变时幂等成功
- **AND** branch 内容变化或 frozen ref 与 HEAD 不一致时 read model 标记 stale

#### Scenario: abandon and cleanup
- **WHEN** owner 明确 abandon 或 cleanup 一个本地 release
- **THEN** abandon 阻止后续 Candidate/update 且保留既有 Git/Task事实；cleanup 只在显式确认后删除本地 branch/lifecycle refs
- **AND** remote ref 存在、ref 漂移或确认缺失时 MUST保留资源并返回恢复动作

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
