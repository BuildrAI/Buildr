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
Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publish dev convergence → transaction evidence`作为唯一发布身份链。每个节点 MUST由其专业owner形成current identity或portable read model；下游 MUST只引用最低充分identity/digest，不得复制专业Result正文、caller-claimed success或历史stdout。

#### Scenario: release内容变化
- **WHEN** current release HEAD或tree不等于Candidate、artifact、readiness或transaction context保存的source
- **THEN** 所有下游evidence MUST标记stale或blocked并拒绝进入tag/npm mutation
- **AND** Buildr MUST形成新的matching Candidate generation和唯一tarball，不得拼接旧run证据

#### Scenario: 关联Task与发布事实
- **WHEN** release transaction需要关联release/support Tasks、Environment、Development、Finish与self-bootstrap
- **THEN** correlation MUST从各Application的current read model和真实Git/GitHub/npm facts构造closed context
- **AND** Task Record MUST继续只保存既有顶层、Parent与retrospective关系
- **AND** MUST NOT新增release旁路SQLite slot、复制Result或接受caller提交的完成结论

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
