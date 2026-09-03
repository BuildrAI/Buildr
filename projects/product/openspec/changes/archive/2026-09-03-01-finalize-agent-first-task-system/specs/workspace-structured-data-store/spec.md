## ADDED Requirements

### Requirement: Workspace SQLite 必须收窄 Task Record 并删除无消费者历史表
Workspace SQLite MUST通过一个连续migration重建`tasks`：删除`schema_version`与`result_no_change`，保留Task identity、title、intent、status、result summary、时间、Parent、`is_parent`、parent completion、result history、legacy Parent Plan与retrospective字段。相同migration MUST删除`terminal_contribution_reconciliations`及其rows，不建立备份、兼容view或replacement。

#### Scenario: 升级当前 Workspace
- **WHEN** retained runtime首次以writable方式打开0030数据库
- **THEN** migration MUST原子达到0031并保留全部保留字段、scope/Change关系、Review与Verification rows
- **AND** MUST删除两个冗余column和旧贡献协调表

#### Scenario: 新 Workspace初始化
- **WHEN** migration chain从空数据库运行到latest
- **THEN** 最终schema MUST只包含当前Task表
- **AND** 旧中间migration文件与ledger checksum MUST保持不变

#### Scenario: 旧 runtime打开0031
- **WHEN** runtime不认识0031
- **THEN** MUST返回database-newer-than-runtime
- **AND** MUST不重建已删除结构或继续写入

## MODIFIED Requirements

### Requirement: Task current records 必须使用最小 SQLite current-state schema
Workspace Structured Store MUST只为Task Record、Planning/Completion Review与Task Verification保存当前长期事实。表只保存所属业务字段、定位与完整性字段，不建设Development、Environment、Finish、Contribution、Overview、通用metadata、event、lease、scheduler或sync state。Task Record结果更正历史继续属于Task Record；Review与Verification保持current-only。

#### Scenario: fresh Workspace 初始化 latest schema
- **WHEN** current runtime首次writable打开fresh canonical store
- **THEN** migrations MUST建立`tasks`、关系表、Review与Verification current表
- **AND** MUST不建立已退役Task current或聚合表

#### Scenario: 已有 current schema 连续升级
- **WHEN** 健康数据库应用到前一version
- **THEN** runner MUST原子应用连续migration并登记checksum
- **AND** MUST保留当前Task、Review与Verification业务事实

#### Scenario: 不存在的 Task 被专业 writer 引用
- **WHEN** Review或Verification repository尝试为不存在Task写current payload
- **THEN** foreign key与Application validation MUST拒绝mutation
- **AND** transaction MUST rollback并保留已有rows

#### Scenario: 专业 current value 被替换
- **WHEN** Domain验证完整新value且repository开始mutation
- **THEN** repository MUST在单一transaction中比较、替换与写后读取
- **AND** 任一失败 MUST rollback且不创建通用lock、revision或event row

#### Scenario: terminal Task 的专业事实被读取
- **WHEN** terminal Task已有合法Review或Verification current record
- **THEN** 各Application MUST仍可只读返回
- **AND** store MUST不删除或隐藏rows

#### Scenario: 旧 File Store records 仍然存在
- **WHEN** 旧Development、Verification或Review YAML存在
- **THEN** runtime MUST忽略旧文件且只读当前SQLite authority
- **AND** MUST不迁移、双写、重建或因此阻塞mutation
