## MODIFIED Requirements

### Requirement: Workspace 可以通过 Skill Contribution 扩展 Task Finish 后续维护
Workspace Component MAY通过`task-finish@append`追加Workspace专属维护。Contribution可以在Formal Task Finish成功后执行后续维护，也可以对交付和remote readback已完成、唯一当前失败为retained Doctor且产品提供matching resume token的run覆盖默认停止规则：先执行专属维护，再恢复同一Finish run。Contribution MUST NOT改写产品固定五阶段、伪造Doctor通过、重建Candidate/Verification/Review/decision或创建第二个Finish authority。通用`task-finish` Skill MUST NOT为Workspace专属维护声明命名slot或依赖自举Skill。

#### Scenario: 自举 Workspace 安装扩展
- **WHEN** Buildr自举Workspace安装同时拥有专属Skill与Contribution的Workspace Component
- **THEN** runtime MUST把Contribution追加到有效`task-finish` Skill末尾，并让Agent在执行前将其作为整份Skill的更具体规则读取
- **AND** 普通用户Workspace未安装该Component时 MUST保持原Task Finish内容和Doctor失败行为，且通用Skill不包含自举slot

#### Scenario: retained Doctor阻塞由自举增强恢复
- **WHEN** Finish已经完成carrier交付和remote readback、唯一当前失败为retained Doctor、冻结贡献命中自举动作且Result包含matching resume token
- **THEN** append MAY覆盖普通停止规则，先调用专属Self-bootstrap Skill，再恢复同一Finish run
- **AND** 最终指定Agent Doctor未通过时 MUST保持Formal Finish blocked且不得cleanup

#### Scenario: 自举收敛未完成
- **WHEN** Formal Task Finish已经成功但Workspace专属自举收敛失败
- **THEN** Agent MUST报告主任务已交付且Workspace收敛未完成，并保留精确恢复现场
- **AND** MUST NOT改写或撤销Formal Task Finish Result与上游研发事实

### Requirement: 通用 Task Finish 不得执行 Buildr development 产品安装
通用 Task Finish MUST只保留current Development handoff消费、Task Contribution、Delivery Baseline、Delivery Carrier、carrier equivalence、fast-forward或普通push、远端回读、必要retained runtime render、指定Agent retained Doctor与Environment cleanup。它 MUST NOT安装默认Buildr CLI、安装或更新`Buildr Dev.app`、硬编码development launcher channel，或根据Product源码路径推断本机产品安装。retained Doctor MUST使用run identity绑定的Agent并要求`health.ready: true`；通用Product executor MUST不识别self-bootstrap Component、执行sync或自动改变Doctor失败结论。

#### Scenario: 普通用户 Workspace 完成交付
- **WHEN** 未安装`buildr-self-bootstrap` Component的用户Workspace完成Formal Task Finish
- **THEN** Finish MUST执行通用交付、指定Agent Doctor与cleanup，并观察到CLI installer和Local App installer调用次数都为零
- **AND** Doctor不ready时 MUST保持blocked，不要求`projects/product/buildr`存在或访问`/Applications/Buildr Dev.app`

#### Scenario: Buildr源码路径进入共用Finish
- **WHEN** Task Contribution包含Buildr CLI、Product Skill或Local App实现路径
- **THEN** 共用Finish MUST仍只执行通用activation与指定Agent Doctor
- **AND** MUST NOT自行执行development CLI、Local App或package sync；是否尝试自举恢复只由Workspace append决定

#### Scenario: 通用 Workspace Doctor 不 ready
- **WHEN** retained指定Agent Doctor返回非零或`health.ready`不为true
- **THEN** Common Finish MUST阻塞deliver且不得进入cleanup
- **AND** MUST保留Doctor findings、partial delivery与精确resume事实，不得自行把self-bootstrap可能性解释为成功
