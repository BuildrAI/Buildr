## ADDED Requirements

### Requirement: Buildr自举Component必须统一执行post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST在Formal Task Finish成功后通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费成功Finish Result中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development CLI install、development Local App install与最终Doctor；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Local App正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不执行sync、CLI install或Local App install

#### Scenario: CLI影响路径
- **WHEN** Formal Finish成功且冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node/CLI identity安装development CLI并运行Doctor
- **AND** Formal Finish本身 MUST观察到CLI installer调用次数为零

#### Scenario: Local App影响路径
- **WHEN** Formal Finish成功且冻结Task Contribution命中Buildr Local App正式影响路径
- **THEN** self-bootstrap activation MUST去重满足CLI依赖并安装development Local App，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Local App

#### Scenario: package workspace inputs
- **WHEN** 冻结Task Contribution命中package manifest或workspace package targets
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push、远端回读与最终Doctor完成收敛
- **AND** package sync MUST不与CLI或Local App分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Local App路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、CLI install、Local App install和最终Doctor
- **AND** MUST不启动第二个orchestrator或持久化新的workflow state

### Requirement: 用户Workspace不得包含或感知Buildr自举activation
Buildr package与runtime projection MUST让未安装`buildr-self-bootstrap` Component的用户Workspace保持无self-bootstrap Skill、Contribution、slot、路径分类、installer或launcher副作用。通用`task-finish` Skill与Product executor MUST不依赖该Component或专属Skill。

#### Scenario: 临时用户Workspace投射Task Finish
- **WHEN** package fixture初始化并render未安装self-bootstrap Component的用户Workspace
- **THEN** runtime MUST包含共用Task Finish且不包含self-bootstrap Skill、Contribution或命名slot
- **AND**普通Project或Service源码任务 MUST不安装或更新Buildr产品

#### Scenario: Buildr自举Workspace投射Component
- **WHEN** 当前Buildr自举Workspace检查并render已安装的`buildr-self-bootstrap` Component
- **THEN** Component integrity MUST证明专属Skill与Contribution完整，且有效Task Finish末尾包含post-Finish activation片段
- **AND** package/runtime parity MUST证明该组合未进入用户package默认能力

### Requirement: self-bootstrap activation evidence必须逐动作可诊断且不建立新authority
self-bootstrap activation MUST报告冻结输入、路径分类、去重动作计划、每个实际命令的身份与结果、push/readback和最终Doctor。该evidence MUST只作为当前post-Finish执行报告，不得写入SQLite、Task Record、Development Receipt、Review/Verification Result、Finish JSON或新的聚合store。

#### Scenario: activation全部通过
- **WHEN** 所有适用self-bootstrap动作与最终Doctor通过
- **THEN** Agent MUST报告每个动作的`passed|not-applicable`、retained commit/CLI/launcher identity与Doctor evidence
- **AND** MUST能证明没有新增authority、store或writer

#### Scenario: activation中途失败
- **WHEN** 任一适用动作失败
- **THEN** 后续不安全动作 MUST停止，并返回已完成动作、失败动作、冻结输入与精确恢复事实
- **AND** MUST不撤销或改写已经complete的Formal Finish
