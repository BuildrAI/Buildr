## MODIFIED Requirements

### Requirement: Task Finish current 与 terminal facts 必须使用窄 SQLite schema
Workspace Structured Store MUST通过连续migration建立且只建立`task_finish_current`一张Task Finish专业表。该表 MUST以foreign key绑定`tasks(task_id)`并为每个Task保存唯一current或terminal row。总体status、current phase、run/Development/Candidate/Content Target/target/carrier/gate identity、current failure、resume、cleanup与时间等真实查询字段 MUST使用普通列；恰好五个固定phase及非查询型有界详情 MUST保存为经Domain验证的closed JSON，但MUST NOT承载与普通列冲突的第二状态authority。表 MUST NOT扩展为history、event、audit、scheduler、sync、execution-record或key/value store。

#### Scenario: fresh Workspace 初始化 latest schema
- **WHEN** current retained runtime首次writable打开新的canonical Workspace Structured Store
- **THEN** migration chain MUST建立一张Finish专业表、foreign key、每Task唯一slot、受验证固定phase JSON、target lease唯一约束与读取所需indexes
- **AND** MUST NOT创建旧四表、`.buildr/task-finish` File Store、第二数据库或跨机器同步记录

#### Scenario: 已有数据库连续升级
- **WHEN** 健康数据库已应用到前一current version并包含旧Finish四表
- **THEN** retained migration runner MUST通过新的连续script原子迁移可证明的run/completion/lease数据、校验source/target集合、删除旧四表并登记匹配checksum
- **AND** MUST NOT修改已应用migration bytes、导入validation-store数据、接入execution-record producer或由candidate runtime升级canonical数据库

#### Scenario: current run 阶段更新
- **WHEN** Domain已验证新的完整run、五阶段、current failure、resume identity与cleanup状态
- **THEN** repository MUST在单一`BEGIN IMMEDIATE` transaction中原位替换`task_finish_current`完整row、写后读取验证并提交
- **AND** busy、constraint、I/O、phase集合或payload一致性失败 MUST rollback并保留最后有效状态

#### Scenario: terminal completion 提交
- **WHEN** Finish证明delivery、remote readback、retained action、Doctor、Environment与Finish-owned cleanup均完成
- **THEN** Application MUST在同一Task Finish mutation中把该行原位替换为compact terminal state与compact phases JSON并释放内嵌lease；Task Record terminal transition仍由Task Record Application拥有
- **AND** 任一专业写入或Task terminal transition失败 MUST保持可恢复的同一current row，不能产生缺少matching Finish proof的delivered结论

#### Scenario: 旧数据无法安全收敛
- **WHEN** 旧run/completion的Task或run identity不一致、phase集合损坏、lease owner无法匹配，或仍有live transient artifact metadata
- **THEN** migration MUST fail closed并rollback该version的schema、data与ledger effects
- **AND** 原数据库 MUST完整保留旧四表以便旧runtime完成清理或人工诊断

### Requirement: Task Finish lease 与 transient metadata 必须保持本机有界
Task Finish target lease MUST内嵌于owner `task_finish_current` row，只保存规范化target identity、不可伪造token与bounded expiry，并由partial unique constraint保证每个target至多一个current owner。acquire、renew与release MUST在事务中使用owner run重观测和token compare-and-set；过期不得仅凭系统时钟转交。Finish-owned carrier/cleanup locator MUST保持在有界current payload，Task Finish MUST NOT再建立per-artifact metadata table或借此接管execution-record producer。所有状态 MUST保持machine-local并排除Git、Work Asset、publication与同步。

#### Scenario: 两个 run 争用同一 target
- **WHEN** current未过期lease已由另一个Task/run row持有
- **THEN** acquire MUST因唯一约束与owner token不匹配而blocked
- **AND** MUST NOT覆盖owner、创建文件lease或依赖last-writer-wins

#### Scenario: 过期 lease 被恢复
- **WHEN** lease超过bounded expiry且恢复方重新观察owner run、target与remote identity
- **THEN** Application MAY在transaction中为同一合法run续租，或在证明旧owner不可继续后以新token转移
- **AND** renew、release或transfer MUST NOT接受旧token修改新owner lease

#### Scenario: Git 或同步发现 Finish 本机状态
- **WHEN** Git scope、Work Asset discovery或publication遇到SQLite sidecar或Finish-owned transient root
- **THEN** Buildr MUST将其保持为machine-local excluded data
- **AND** MUST NOT stage、commit、push、同步或把不同成员的本地Finish状态合并

#### Scenario: Doctor 检查 Finish schema
- **WHEN** Doctor检查存在的Workspace Structured Store
- **THEN** Doctor MUST有界报告migration、foreign key、唯一current slot、固定phase JSON、dangling reference、expired lease与cleanup pending状态
- **AND** MUST NOT要求旧四表、输出完整Task payload/命令日志/数据库页，或自动删除无法证明ownership的文件
