## MODIFIED Requirements

### Requirement: self-bootstrap activation evidence必须逐动作可诊断且不建立新authority
self-bootstrap activation MUST报告冻结输入、路径分类、去重动作计划、每个实际命令的身份与结果、push/readback、retained checkout显式开发入口identity和最终Doctor。Development entry evidence MUST包含Project bridge与Service CLI entry真实路径、Environment retained Node、预期及观测package/version/channel/source；MUST NOT读取、改变或要求PATH默认`buildr`。该evidence MUST只作为当前post-Finish执行报告，不得写入SQLite、Task Record、Development Receipt、Review/Verification Result、Finish JSON或新的聚合store。

#### Scenario: activation全部通过
- **WHEN** 所有适用self-bootstrap动作、显式开发入口identity与最终Doctor通过
- **THEN** Agent MUST报告每个动作的`passed|not-applicable`、retained commit、development entry、Node、package/version与Doctor evidence
- **AND** MUST能证明没有PATH默认CLI mutation、新增authority、store或writer

#### Scenario: activation中途失败
- **WHEN** 任一适用动作或显式开发入口identity验证失败
- **THEN** 后续不安全动作 MUST停止，并返回已完成动作、失败动作、冻结输入、入口链证据与精确恢复事实
- **AND** MUST不撤销或改写已经complete的Formal Finish

### Requirement: Buildr 自举 Component 必须统一执行 Buildr Web post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费同一Finish run中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development Buildr Web install、retained checkout显式开发入口验证与最终Doctor/Finish resume；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献，也 MUST NOT安装、删除或验证PATH默认development CLI。Formal Finish首轮Doctor通过时activation位于complete之后；首轮Doctor blocked时，只有前序delivery/remote evidence、matching resume token和适用动作全部成立，activation才可以先修复retained状态并恢复同一run。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不覆盖Doctor failure、不执行sync、Buildr Web install、开发入口验证或PATH CLI mutation

#### Scenario: CLI影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node显式运行delivered retained checkout的`projects/product/buildr`并验证其identity
- **AND** 通用Product executor和self-bootstrap runner MUST观察到development CLI installer调用次数为零

#### Scenario: Buildr Web影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST安装development Buildr Web，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Buildr Web或PATH默认CLI

#### Scenario: package workspace inputs
- **WHEN** 冻结Task Contribution命中package manifest或workspace package targets
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push与远端回读完成收敛
- **AND** package sync MUST不与Buildr Web或开发入口分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Buildr Web路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、Buildr Web install、显式开发入口验证和最终Doctor或Finish resume
- **AND** MUST不启动第二个orchestrator、安装development CLI或持久化新的workflow state

#### Scenario: 默认CLI identity通过
- **WHEN** 任一self-bootstrap动作适用且所有适用安装动作已经完成
- **THEN** runner MUST以Environment retained Node显式执行retained `projects/product/buildr version --json`，并证明Project bridge、Service CLI entry、source与package/version属于本次delivered retained checkout
- **AND** runner MUST不解析或执行PATH默认`buildr`

#### Scenario: 默认CLI identity失败
- **WHEN** Project bridge缺失、不可执行、启动失败、未使用retained Node、source或CLI entry指向其他checkout、channel或package/version不一致
- **THEN** self-bootstrap activation MUST fail closed并停止最终Doctor或Finish resume
- **AND** Result MUST保留预期与观测入口、Node、package/version及精确恢复事实

#### Scenario: Doctor-blocked run恢复
- **WHEN** 同一run的前序交付完整、唯一失败为retained Doctor、存在matching resume token且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在动作和显式开发入口identity验证成功后，通过该retained Project bridge用token恢复同一Finish run，由resume中的指定Agent Doctor形成最终结论
- **AND** MUST不额外运行第二个最终Doctor、不创建新orchestrator或持久化新的workflow state

#### Scenario: Formal Finish已经complete
- **WHEN** 首轮指定Agent Doctor、cleanup与Formal Finish已经成功且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在post-Finish动作和显式开发入口identity验证后，通过该retained Project bridge显式运行一次最终指定Agent Doctor
- **AND** 任一动作即使被多条路径命中也 MUST至多执行一次
