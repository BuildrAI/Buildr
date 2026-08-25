## ADDED Requirements

### Requirement: Finish carrier 清理事实必须绑定物理删除
Task Finish MUST 将每个repository的Delivery Carrier cleanup与Task Environment cleanup独立执行和记录。只有matching carrier worktree registration已移除、物理root不存在且run container在适用时为空并已删除，稳定Finish/self-bootstrap投影才能声明该carrier为`availability: cleaned`与`root: null`。Environment cleanup的`attention|blocked`、Finish cleanup phase的`passed`或Task completed均 MUST NOT替代carrier物理清理证据。

#### Scenario: Environment cleanup attention但carrier成功清理
- **WHEN** remote target已证明包含Task Contribution，Task Environment cleanup返回attention，且Finish能证明并删除当前run-owned carrier
- **THEN** Delivery MUST保持delivered，Environment cleanup MUST保持attention，carrier MUST投影cleaned且物理路径与registration均不存在

#### Scenario: carrier删除失败
- **WHEN** carrier registration、path、identity或删除结果不可证明
- **THEN** Finish MUST保留真实carrier root并投影retained或attention，MUST NOT因cleanup phase passed或Task completed改写为cleaned

### Requirement: Structured Store migration 必须在最终Doctor前由Activation写入
当Workspace Delivery使retained runtime出现pending Structured Store migration时，Task Finish/self-bootstrap MUST让matching run的owner-bound writable Activation在最终Doctor前通过Product-owned transaction应用migration。Doctor MUST继续只读；migration未成功时 MUST停止最终Doctor并形成Activation attention与同一run恢复入口，且 MUST NOT撤销Delivery、重跑Candidate/Verification或重新push业务代码。

#### Scenario: 交付新增连续migration
- **WHEN** Workspace carrier已交付，retained store版本低于delivered runtime target，且matching self-bootstrap Activation取得current target lease与retained writer
- **THEN** Activation MUST原子应用全部pending migration并记录before/after version，随后才运行sync、development entry验证与最终Doctor

#### Scenario: migration activation失败
- **WHEN** migration checksum、writer provenance、transaction或identity校验失败
- **THEN** Activation MUST返回attention并保留同一run恢复事实，最终Doctor MUST不执行且Delivery MUST保持delivered

### Requirement: 已交付历史run必须支持owner-bound恢复
对Delivery已证明但carrier/self-bootstrap maintenance不闭合的历史Finish run，Buildr MUST从该run冻结的Task Contribution、carrier Git identity、remote containment与canonical Workspace facts重建精确恢复资格。恢复 MUST只清理该run-owned carrier，并允许同一self-bootstrap runner使用显式foreign-clear recovery继续Activation；MUST NOT创建新Finish run、重做Delivery或修改其他Task carrier。

#### Scenario: 当前run被错误cleaned投影阻断
- **WHEN** Finish Result声明carrier cleaned但matching真实carrier仍registered、clean且HEAD已被remote target包含
- **THEN** owner recovery MUST把它视为当前run的retained carrier，精确删除后允许同一run继续self-bootstrap，而不是报告未知foreign Task
