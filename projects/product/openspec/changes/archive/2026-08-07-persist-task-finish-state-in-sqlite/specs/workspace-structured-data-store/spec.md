## ADDED Requirements

### Requirement: Task Finish current 与 terminal facts 必须使用窄 SQLite schema
Workspace Structured Store MUST通过连续migration建立Task Finish专业表，分别保存current run、compact terminal completion、target lease与transient artifact metadata。run/completion MUST以foreign key绑定`tasks(task_id)`；每个Task至多一个未终结current run和一个terminal completion，每个规范化target至多一个current lease。表 MUST只规范化定位、唯一性、完整性与真实查询所需字段，其余数据 MUST保存为经Domain验证的closed payload；MUST NOT扩展为通用history、event、audit、scheduler、sync或key/value store。

#### Scenario: fresh Workspace 初始化 latest schema
- **WHEN** current retained runtime首次writable打开新的canonical Workspace Structured Store
- **THEN** migration chain MUST建立Finish专业表、foreign keys、唯一slots与读取所需indexes
- **AND** MUST NOT创建`.buildr/task-finish` File Store、第二数据库或跨机器同步记录

#### Scenario: 已有数据库连续升级
- **WHEN** 健康数据库已应用到前一current version
- **THEN** retained migration runner MUST通过新的连续script原子建立Finish schema并登记匹配checksum
- **AND** MUST NOT修改已应用migration bytes、导入validation-store数据或由candidate runtime升级canonical数据库

#### Scenario: current run 阶段更新
- **WHEN** Domain已验证新的完整run payload、current failure、resume identity与artifact metadata
- **THEN** repository MUST在单一`BEGIN IMMEDIATE` transaction中替换精确current slot、写后读取验证并提交
- **AND** busy、constraint、I/O或payload失败 MUST rollback并保留最后有效状态

#### Scenario: terminal completion 提交
- **WHEN** Finish证明delivery、remote readback、retained action、Doctor、Environment与transient cleanup均完成
- **THEN** Application MUST在同一Structured Store mutation中写入compact completion、删除current run/lease/artifact rows并完成Task Record terminal transition
- **AND** 任一失败 MUST rollback，不能产生completed Task缺少Finish proof或Finish complete但Task仍active的新状态

### Requirement: Task Finish lease 与 transient metadata 必须保持本机有界
Task Finish target lease MUST由SQLite唯一约束、owner run、不可伪造token、bounded expiry与heartbeat组成；artifact metadata MUST只引用canonical Workspace内登记的run-owned transient root。它们 MUST保持machine-local并排除Git、Work Asset、publication与同步，不得成为团队合并或远端协调机制。

#### Scenario: 两个 run 争用同一 target
- **WHEN** current未过期lease已由另一个run持有
- **THEN** acquire MUST因唯一约束与owner token不匹配而blocked
- **AND** MUST NOT覆盖owner、创建文件lease或依赖last-writer-wins

#### Scenario: 过期 lease 被恢复
- **WHEN** lease超过bounded expiry且恢复方重新观察run、target与remote identity
- **THEN** Application MAY在transaction中回收或续租给同一合法run
- **AND** MUST NOT仅依据系统时钟把target交给不同run

#### Scenario: Git 或同步发现 Finish 本机状态
- **WHEN** Git scope、Work Asset discovery或publication遇到SQLite sidecar或Finish transient root
- **THEN** Buildr MUST将其保持为machine-local excluded data
- **AND** MUST NOT stage、commit、push、同步或把不同成员的本地Finish状态合并

#### Scenario: Doctor 检查 Finish schema
- **WHEN** Doctor检查存在的Workspace Structured Store
- **THEN** Doctor MUST有界报告migration、foreign key、唯一current slot、dangling reference、expired lease、cleanup pending与orphan transient状态
- **AND** MUST NOT输出完整Task payload、命令日志、数据库页或自动删除无法证明ownership的文件
