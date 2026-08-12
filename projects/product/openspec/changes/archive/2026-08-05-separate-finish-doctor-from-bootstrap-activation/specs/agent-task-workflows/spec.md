## MODIFIED Requirements

### Requirement: 通用 Task Finish 不得执行 Buildr development 产品安装
通用 Task Finish MUST只保留current Development handoff消费、Task Contribution、Delivery Baseline、Delivery Carrier、carrier equivalence、fast-forward或普通push、远端回读、必要retained runtime render、retained Doctor与Environment cleanup。它 MUST NOT安装默认Buildr CLI、安装或更新`Buildr Dev.app`、硬编码development launcher channel，或根据Product源码路径推断本机产品安装。retained Doctor MUST使用通用Workspace inventory模式并继续要求`health.ready: true`；它 MUST NOT选择Agent adapter从而把预期由post-Finish self-bootstrap activation修复的Product runtime drift提升为Formal Finish失败。

#### Scenario: 普通用户 Workspace 完成交付
- **WHEN** 未安装`buildr-self-bootstrap` Component的用户Workspace完成Formal Task Finish
- **THEN** Finish MUST执行通用交付、inventory Doctor与cleanup，并观察到CLI installer和Local App installer调用次数都为零
- **AND** MUST NOT要求`projects/product/buildr`存在或访问`/Applications/Buildr Dev.app`

#### Scenario: Buildr源码路径进入共用Finish
- **WHEN** Task Contribution包含Buildr CLI、Product Skill或Local App实现路径
- **THEN** 共用Finish MUST仍只执行通用activation与inventory Doctor
- **AND** MUST NOT把selected Agent Product runtime、development CLI或Local App安装成功作为delivered必要条件

#### Scenario: 通用 Workspace Doctor 不 ready
- **WHEN** retained inventory Doctor返回非零或`health.ready`不为true
- **THEN** Common Finish MUST阻塞deliver且不得进入cleanup
- **AND** MUST保留Doctor findings与精确resume事实，不得以post-Finish activation掩盖通用Workspace错误
