## MODIFIED Requirements

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
