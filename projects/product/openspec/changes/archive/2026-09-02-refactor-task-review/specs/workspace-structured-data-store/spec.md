## MODIFIED Requirements

### Requirement: Task current records 必须使用最小 SQLite current-state schema
Workspace Structured Store MUST以独立窄表保存Development、Verification与Planning/Completion Review current records。表只保存定位/完整性字段和closed payload，不建设通用metadata、history、event、audit、revision、lease、lock、scheduler或sync state。Task Review的expected digest比较是单次writer事务安全检查，不新增持久CAS状态。

#### Scenario: fresh Workspace 初始化 latest schema
- **WHEN** current runtime首次writable打开fresh canonical store
- **THEN** migrations MUST建立专业current tables、foreign keys、唯一slots与真实索引
- **AND** MUST不建立旧YAML import、history或sync tables

#### Scenario: 已有 current schema 连续升级
- **WHEN** 健康数据库应用到前一version
- **THEN** runner MUST原子应用连续migration并登记checksum
- **AND** MUST不修改已应用migration bytes、name或checksum

#### Scenario: 不存在的 Task 被专业 writer 引用
- **WHEN** 专业repository尝试为不存在的Task写current payload
- **THEN** foreign key与Application validation MUST拒绝mutation
- **AND** transaction MUST rollback并保留已有rows

#### Scenario: 专业 current value 被替换
- **WHEN** Domain验证完整新value且repository开始mutation
- **THEN** repository MUST在单一transaction中完成必要compare、替换与写后读取
- **AND** 任一失败 MUST rollback，且不得创建通用lock、revision或event row

#### Scenario: terminal Task 的专业事实被读取
- **WHEN** terminal Task已有合法专业current records
- **THEN** 各Application MUST仍可只读返回
- **AND** store MUST不删除或隐藏rows

#### Scenario: 旧 File Store records 仍然存在
- **WHEN** 旧Development、Verification或Review YAML存在
- **THEN** runtime MUST忽略旧文件且只读SQLite
- **AND** MUST不迁移、双写、重建或因此阻塞mutation

## ADDED Requirements

### Requirement: Task Review v1 current必须一次迁入v2
连续SQLite migration MUST原子重建`task_review_current`，把`target_identity`迁为`subject_identity`、v1 Result迁为closed v2，并把`ready|changes-required`映射为`accepted|changes-requested`。迁移 MUST验证row数量、Task/type/subject/outcome/time与JSON一致；MUST不建立dual-read或history表。

#### Scenario: 合法v1 rows升级
- **WHEN** Workspace同时有Planning和Completion v1 current rows
- **THEN** migration MUST逐slot保留method、reviewed、uncovered、findings、summary和completedAt
- **AND** 新runtime MUST只读取v2

#### Scenario: 损坏v1 row升级
- **WHEN** 任一row缺少合法subject identity或outcome
- **THEN** migration MUST完整rollback并保留v1表与ledger
