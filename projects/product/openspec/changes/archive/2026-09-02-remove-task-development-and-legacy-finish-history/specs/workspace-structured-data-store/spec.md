## ADDED Requirements

### Requirement: Workspace SQLite 必须删除 Development 与旧 Finish 表
Buildr MUST通过连续migration直接删除`task_development_current`与`task_finish_current`及全部rows。Migration MUST不建立history、backup、compatibility或replacement表，也 MUST不修改Task Record、Review、Verification、Environment、Retrospective和legacy Parent Plan数据。

#### Scenario: 现有Workspace升级
- **WHEN** retained current runtime打开包含Development与Finish表的健康数据库
- **THEN** migration MUST在一个版本事务中删除两张表并登记checksum
- **AND** 其他表的row count与payload MUST保持不变

#### Scenario: fresh database初始化
- **WHEN** current runtime初始化新Workspace Structured Store
- **THEN** 完整migration chain结束后 MUST不存在两张退役表
- **AND** MUST不创建任何替代历史表

#### Scenario: 旧runtime打开升级数据库
- **WHEN** 旧runtime不认识删除表的migration
- **THEN** MUST返回database-newer-than-runtime
- **AND** MUST不重建退役表或继续写入

## REMOVED Requirements

### Requirement: Task Finish current 与 terminal facts 必须使用窄 SQLite schema
**Reason**: 旧Finish历史和数据整体删除。
**Migration**: 删除`task_finish_current`且不迁移。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish lease 与 transient metadata 必须保持本机有界
**Reason**: 旧Finish Application与lease整体退役。
**Migration**: 默认收尾直接使用现有工具，不建立新lease。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 专业 current rows 必须保存读取所需的规范化事实
**Reason**: 该Requirement包含Development row；保留专业row由各自spec负责。
**Migration**: Review、Verification和Environment继续保存自己的最小查询字段。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
