## ADDED Requirements

### Requirement: 通用 Task Finish 不得执行 Buildr development 产品安装
通用 Task Finish MUST只保留current Development handoff消费、Task Contribution、Delivery Baseline、Delivery Carrier、carrier equivalence、fast-forward或普通push、远端回读、必要retained runtime render、retained Doctor与Environment cleanup。它 MUST NOT安装默认Buildr CLI、安装或更新`Buildr Dev.app`、硬编码development launcher channel，或根据Product源码路径推断本机产品安装。

#### Scenario: 普通用户 Workspace 完成交付
- **WHEN** 未安装`buildr-self-bootstrap` Component的用户Workspace完成Formal Task Finish
- **THEN** Finish MUST执行通用交付、Doctor与cleanup，并观察到CLI installer和Local App installer调用次数都为零
- **AND** MUST NOT要求`projects/product/buildr`存在或访问`/Applications/Buildr Dev.app`

#### Scenario: Buildr源码路径进入共用Finish
- **WHEN** Task Contribution包含Buildr CLI或Local App实现路径
- **THEN** 共用Finish MUST仍只执行通用activation与Doctor
- **AND** MUST NOT把development CLI或Local App安装成功作为delivered必要条件

### Requirement: Task Finish v2 delivered证明必须兼容旧安装字段但解除其门禁权责
`buildr.task-finish-result/v2` MUST继续作为Finish JSON authority，并 MUST让delivered证明绑定Task、handoff、Candidate/generation、Content Target、carrier equivalence、remote readback、通用retained activation、Doctor与cleanup。`runtimeInstall`和`localAppDelivery`若继续输出 MUST为deprecated兼容字段且不拥有delivered gate authority；产品 MUST NOT仅为重命名创建新schema或把self-bootstrap evidence复制到其他store。

#### Scenario: 新Finish Result不含产品安装成功
- **WHEN** 新v2 run完成通用delivery与cleanup且兼容字段为`not-applicable`或缺失
- **THEN** terminal projection MUST认定该handoff已delivered
- **AND** MUST NOT要求self-bootstrap activation evidence存在

#### Scenario: 读取旧已完成v2 Result
- **WHEN** terminal reader读取包含`runtimeInstall: passed`与development `localAppDelivery: passed`的旧完整v2 Result
- **THEN** reader MUST安全保持其既有delivered判断
- **AND** MUST NOT迁移、重写或复制该Result

### Requirement: Formal Finish成功后的自举activation失败不得改写研发与交付事实
Workspace专属self-bootstrap activation MUST位于Formal Finish成功之后。失败 MUST明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实，并 MUST NOT改写Finish Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup。

#### Scenario: CLI activation失败
- **WHEN** Formal Finish已complete且post-Finish development CLI安装失败
- **THEN** Finish Result MUST保持complete且Environment MUST保持cleaned
- **AND** Agent MUST返回精确installer失败与恢复入口，不得重跑Formal Verification、生成Candidate或重新执行Finish

#### Scenario: Local App activation失败
- **WHEN** Formal Finish已complete且development Local App安装失败
- **THEN** Agent MUST保留主任务已交付事实并报告自举activation未完成
- **AND** MUST NOT触碰稳定版Local App或修改共享历史
