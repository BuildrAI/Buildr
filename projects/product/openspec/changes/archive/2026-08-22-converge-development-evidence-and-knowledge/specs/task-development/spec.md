## REMOVED Requirements

### Requirement: Formal Verification 必须在 Candidate freeze 之前绑定 Content Target

**Reason**: Verification 不再是 Candidate 内容身份的前置证明；它必须绑定已经冻结的 current Candidate，才能支持多种合法工作顺序和受控证据对账。

**Migration**: 使用新增的“Formal Verification 必须绑定 current Candidate”Requirement；旧Result保持可读但不回填Candidate绑定。

#### Scenario: current Result满足policy事实完整性
- **WHEN** Verification Application返回Result target等于current Content Target、declarations current，且required capability facts或明确coverage gap完整
- **THEN** Development MAY 将Verification gate记为current并继续Candidate freeze
- **AND** Candidate value MUST NOT包含Result identity或digest

#### Scenario: Verification仍绑定旧Content Target
- **WHEN** Result target与current Content Target不同或declaration applicability为stale/unknown
- **THEN** Candidate freeze MUST blocked并返回Task Verification next action
- **AND** Development MUST NOT改写Result、applicability或伪造passed evidence

#### Scenario: Verification结论not-passed
- **WHEN** current Result完整但结论为`not-passed`
- **THEN** Development MAY冻结Candidate，但在没有绑定精确Verification Result digest、范围和授权来源的风险接受时 MUST记录blocked且不得形成handoff
- **AND** scoped risk MUST NOT把Verification事实改写为passed或使stale/incomplete Result适用

## ADDED Requirements

### Requirement: Formal Verification 必须绑定 current Candidate
Development MUST 先建立stable Content Target与verification policy并冻结current Candidate，再由Task Verification workflow针对该Candidate形成current Result。Application MUST通过Task Verification Application inspect证明Candidate、target与declarations current，且policy要求的capability fact或coverage gap完整；Application本身MUST NOT执行formal Verification、写Verification Result或把`not-passed`改写为`passed`。

#### Scenario: current Result满足policy事实完整性
- **WHEN** Verification Application返回Result Candidate等于current Candidate、target等于current Content Target、declarations current，且required capability facts或明确coverage gap完整
- **THEN** Development MAY将Verification gate记为current并继续Completion Review与handoff判断
- **AND** Candidate value MUST NOT包含Result identity或digest

#### Scenario: Verification仍绑定旧Candidate或Content Target
- **WHEN** Result Candidate、generation、target或declaration applicability任一为stale/unknown
- **THEN** Verification gate MUST保持missing或stale并返回Task Verification reconciliation next action
- **AND** Development MUST NOT改写Result、applicability或伪造passed evidence

#### Scenario: Verification结论not-passed
- **WHEN** current Result完整但结论为`not-passed`
- **THEN** Development MAY保持Candidate current，但在没有绑定精确Verification Result digest、范围和授权来源的风险接受时 MUST记录blocked且不得形成handoff
- **AND** scoped risk MUST NOT把Verification事实改写为passed或使stale/incomplete Result适用

## MODIFIED Requirements

### Requirement: Formal Verification readiness 必须在稳定目标交接处只读派生
Task Development Application MUST在operation Result与compact projection中根据current Task Context、Planning、Content Target、verification policy、Candidate与Verification gate派生response-only `formalVerificationReadiness`，并 MUST区分`not-applicable|blocked|ready`。该摘要 MUST NOT写入Development Receipt、SQLite新slot、Candidate identity、Current Knowledge disposition或专业Result；Task Development MUST NOT解释current knowledge正文或执行Formal Verification。

#### Scenario: Change仍pending时拒绝观察稳定目标
- **WHEN** `observe`提交的完整Change dispositions中至少一项为`pending`
- **THEN** Application MUST在Content Target observation与Receipt写入前返回稳定blocked诊断并保留原current Receipt
- **AND** MUST要求先完成对应Change的实现、checklist与deterministic convergence/archive，不得把pending内容标记为stable target或冻结Candidate

#### Scenario: 无Change或明确不适用
- **WHEN** code-only或Workspace-only Task提交空Change列表，或者全部关联Change均为可证明的`converged`或明确`not-applicable`
- **THEN** `observe` MUST继续按现有Content Target规则工作，不得因预检强制创建Change、knowledge sidecar或额外验证能力
- **AND** 开发期focused/affected反馈与Task外transient verification MUST不消费该readiness

#### Scenario: 已知交接事实尚未稳定
- **WHEN** Task Context存在pending Change，或Planning、Content Target、verification policy任一已知missing/stale，或Candidate输入已经漂移
- **THEN** response-only readiness MUST为`blocked`，或在尚未到Candidate交接阶段时为`not-applicable`，并列出Development-owned最小reason code
- **AND** typed next MUST不把该状态伪装成可直接执行的Formal Verification

#### Scenario: 已知事实就绪但current knowledge需即时确认
- **WHEN** Change dispositions已处置，Planning、Content Target、policy与Candidate均current，matching Formal Verification仍缺失，但current knowledge disposition尚未形成
- **THEN** readiness MUST为`ready`并允许consumer把Candidate lease交给Task Verification
- **AND** Current Knowledge MAY在Verification前后独立形成；readiness MUST不推断provider结论或把knowledge未知持久化为blocked

#### Scenario: 尚未冻结Candidate
- **WHEN** stable Content Target与policy已经形成但current Candidate尚未冻结
- **THEN** readiness MUST为`not-applicable`且typed next MUST先指向Candidate freeze
- **AND** MUST不要求Current Knowledge或Verification先于Candidate形成

#### Scenario: Candidate已就绪且Verification缺失
- **WHEN** current Candidate、Task Context、Planning、Content Target与policy均current，且matching Formal Verification尚未形成
- **THEN** readiness MUST为`ready`并允许consumer把Candidate lease交给Task Verification
- **AND** Current Knowledge disposition MAY在Verification前后形成，不得固定为本次交接前置gate

#### Scenario: Candidate输入已漂移
- **WHEN** Candidate存在但Task Context、Planning、Content Target或policy任一不再current
- **THEN** readiness MUST为`blocked`并列出Development-owned最小reason code
- **AND** MUST不启动Formal Verification或把旧Candidate lease声明为current

#### Scenario: 已有matching Formal Verification
- **WHEN** Task Development已消费与current Candidate、Content Target、declarations和policy匹配的Verification Result
- **THEN** readiness MUST为`not-applicable`，后续next继续由Completion、Current Knowledge与decision规则决定
- **AND** MUST不要求重复Formal Verification或改变Candidate generation

### Requirement: Candidate identity 与generation必须只由Development生成
Application MUST只在Task context、stable Content Target、verification policy与Candidate前适用的planning dispositions得到明确处置时冻结Candidate。Candidate closed value MUST只包含`identity`、正整数`generation`、`contentTargetIdentity`、`taskContextIdentity`与`policyIdentity`；identity MUST绑定这四项，generation MUST只由Development单调生成。Content Target、Task Context、policy或Candidate前planning disposition变化MUST使current Candidate失效；后续Verification、Completion Review或Current Knowledge disposition变化MUST使相关gate、decision与handoff失效，但MUST NOT改变Candidate identity或generation。

#### Scenario: 首次冻结Candidate
- **WHEN** Candidate前适用事实完整且当前没有Candidate
- **THEN** Application MUST生成generation 1与唯一Candidate identity
- **AND** Review/Verification Result digest、knowledge disposition、Environment identity、时间、branch或commit MUST NOT进入Candidate

#### Scenario: 已有current Candidate重复freeze
- **WHEN** Task Context、Content Target、policy与Candidate前planning disposition均未变化且current Candidate仍适用
- **THEN** freeze MUST幂等返回同一Candidate/generation
- **AND** MUST NOT仅因Verification、Completion或knowledge尚未形成而递增generation

#### Scenario: 失效后形成下一代Candidate
- **WHEN** 旧Candidate已因Content Target、Task Context、policy或Candidate前planning disposition变化失效，新的事实重新满足freeze条件
- **THEN** Application MUST生成严格大于旧generation的新Candidate
- **AND** Receipt MUST只保留新current Candidate，不创建完整generation history；既有正式handoff snapshots保持不可变

### Requirement: Development 必须独占proceed/blocked、scoped risk与Finish handoff
只有Task Development MAY根据current Candidate、专业Result gates、current knowledge disposition与明确`not-applicable|waived` dispositions形成`proceed|blocked` decision，并记录与Task Intent或明确用户授权相关的最小portable scoped risk。只有current Candidate、全部适用gate与disposition、非blocked的current knowledge disposition及`proceed` decision同时成立时，Application MAY形成immutable handoff snapshot与identity；Verification、Review与Current Knowledge专业事实 MUST保持各自authority。

#### Scenario: 全部正向gate满足且决定proceed
- **WHEN** current Candidate、适用专业gate、合法not-applicable/waived dispositions、policy coverage与current knowledge disposition均current
- **THEN** Application MUST形成绑定Candidate、gate/disposition refs、knowledge disposition与decision的Finish handoff
- **AND** handoff MUST不包含Result body、knowledge正文、raw output、临时路径或delivery execution plan

#### Scenario: 用户接受负向Verification或Completion风险
- **WHEN** current Verification为`not-passed`、存在coverage gap或current Completion为`changes-required`，且用户明确接受与Task Intent相关的风险
- **THEN** Development MAY记录gate、精确Result digest、scope、summary与authorization source并据此决定proceed
- **AND** MUST NOT用风险接受改写专业事实、接受completion-critical knowledge conflict或绕过stale/incomplete gate、Content Target漂移

#### Scenario: handoff后上游漂移
- **WHEN** planning snapshot、Content Target、Task context、policy、Candidate、current knowledge或任一gate applicability/disposition变化
- **THEN** Application MUST清除current decision、判定旧snapshot不再current并返回`task-development`
- **AND** Finish MUST不得继续消费旧snapshot，Application MUST NOT改写或删除它

## ADDED Requirements

### Requirement: Development 必须聚合 current knowledge disposition 而不固定执行顺序
Task Development MUST允许selected Current Knowledge provider在实现、Review或Verification前后针对current Content Target形成最小 disposition，并通过`knowledge` action保存tree identity、`aligned|not-applicable|attention|blocked`状态、portable summary、source identities与bounded unresolved items。Application MUST NOT解释knowledge正文、修改knowledge资产或要求固定调用顺序。

#### Scenario: 会造成错误完成结论的冲突
- **WHEN** canonical spec、实现、registry或current knowledge冲突会使当前Task的完成结论错误
- **THEN** provider MUST返回`blocked`且Development MUST阻止decision proceed与handoff
- **AND** waiver、聊天摘要、Git HEAD或文件存在 MUST NOT把该冲突降级

#### Scenario: 解释性漂移或无关历史债务
- **WHEN** drift不会改变当前Task行为、authority、风险或完成结论
- **THEN** provider MUST返回`attention`且Development MAY继续Candidate、Verification、Completion与handoff
- **AND** attention MUST保留在Development/handoff最小事实中供后续consumer展示或建立后续Task

#### Scenario: Content Target变化
- **WHEN** 保存的knowledge tree identity不再等于current Content Target identity
- **THEN** knowledge disposition MUST派生为stale并使current decision/handoff失效
- **AND** Application MUST不自动重跑provider或复用旧aligned结论
