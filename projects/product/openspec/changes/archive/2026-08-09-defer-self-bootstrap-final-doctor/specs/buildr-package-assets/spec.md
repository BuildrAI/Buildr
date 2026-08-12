## MODIFIED Requirements

### Requirement: Buildr自举Component必须统一执行post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费同一Finish run中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development CLI install、development Local App install与最终Doctor/Finish resume；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献。Formal Finish首轮Doctor通过时activation位于complete之后；首轮Doctor blocked时，只有前序delivery/remote evidence、matching resume token和适用动作全部成立，activation才可以先修复retained状态并恢复同一run。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Local App正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不覆盖Doctor failure、不执行sync、CLI install或Local App install

#### Scenario: CLI影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node/CLI identity安装development CLI
- **AND** 通用Product executor本身 MUST观察到CLI installer调用次数为零

#### Scenario: Local App影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr Local App正式影响路径
- **THEN** self-bootstrap activation MUST去重满足CLI依赖并安装development Local App，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Local App

#### Scenario: package workspace inputs
- **WHEN** 冻结Task Contribution命中package manifest或workspace package targets
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push与远端回读完成收敛
- **AND** package sync MUST不与CLI或Local App分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Local App路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、CLI install、Local App install和最终Doctor或Finish resume
- **AND** MUST不启动第二个orchestrator或持久化新的workflow state

#### Scenario: Doctor-blocked run恢复
- **WHEN** 同一run的前序交付完整、唯一失败为retained Doctor、存在matching resume token且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在动作成功后用该token恢复同一Finish run，由resume中的指定Agent Doctor形成最终结论
- **AND** MUST不额外运行第二个最终Doctor、不创建新orchestrator或持久化新的workflow state

#### Scenario: Formal Finish已经complete
- **WHEN** 首轮指定Agent Doctor、cleanup与Formal Finish已经成功且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在post-Finish动作后显式运行一次最终指定Agent Doctor
- **AND** 任一动作即使被多条路径命中也 MUST至多执行一次

### Requirement: 产品验证必须覆盖已包含交付与post-Finish自举
Buildr package与runtime verification MUST覆盖Task Finish `already-contained` target disposition、正常post-Finish activation和retained Doctor blocked后的自举恢复，并证明普通用户Workspace、通用Task Finish Skill和Product executor不获得self-bootstrap专属依赖、路径分类或Doctor绕过分支。

#### Scenario: 验证 already-contained 快速完成
- **WHEN** integration fixture先交付carrier，再以保留全部carrier changed path after states的后续commit推进target
- **THEN** verifier MUST观察到零Task Contribution reapply、零新carrier commit、零Formal Verification execution和成功cleanup
- **AND** Result MUST包含ancestor/path-state containment evidence、原carrier ref和最新final remote ref

#### Scenario: 验证同路径变化仍fail closed
- **WHEN** 后续target commit改变任一carrier-owned path或无法读取target identity
- **THEN** verifier MUST观察到现有target-race或Delivery Adaptation路径
- **AND** MUST NOT观察到`already-contained`、自动冲突解决、Candidate rebuild或force push

#### Scenario: 验证自举只在Formal Finish后激活
- **WHEN** Buildr自举fixture的Formal Finish首轮成功且冻结Task Contribution命中自举影响路径
- **THEN** verifier MUST观察到Finish五阶段先完成，随后单一post-Finish activation按路径去重执行适用动作与最终Doctor
- **AND** Formal Finish Product executor MUST不执行package sync、development CLI install或development Local App install

#### Scenario: 验证Doctor-blocked自举恢复
- **WHEN** 自举fixture在remote readback后让首次指定Agent Doctor失败，冻结贡献命中自举动作且append存在
- **THEN** verifier MUST观察到专属activation、同一run精确resume、最终指定Agent Doctor和之后的cleanup
- **AND** MUST观察到Candidate/generation、Formal Verification、Completion Review和handoff保持不变

#### Scenario: 验证普通 Workspace 不采用自举activation
- **WHEN** 未安装`buildr-self-bootstrap` Component的临时Workspace遇到相同指定Agent Doctor失败
- **THEN** Task Finish MUST保持blocked且不得进入cleanup
- **AND** runtime/package MUST不存在self-bootstrap slot、隐式dependency、路径分类或executor特判
