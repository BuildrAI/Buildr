## REMOVED Requirements

### Requirement: Task Delivery 与 Finish 必须归属 Task 模块的明确技术分层
**Reason**: 旧Finish集群不再存在；默认收尾是Skill编排。
**Migration**: 删除旧模块装配，保留Task Record、Environment和Git等独立能力。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task 模块入口必须唯一装配 Finish 与 Terminal Delivery
**Reason**: Finish与Terminal Delivery模块整体退役。
**Migration**: Bootstrap不再装配对应runtime port。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Finish CLI 与 retained recovery 必须通过 Task 模块入口接入
**Reason**: 旧CLI与recovery不再支持。
**Migration**: 删除命令、help和retained recovery实现。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 交付副作用与专业 authority 必须保持隔离
**Reason**: 该Requirement依附已退役Finish Application。
**Migration**: 默认task-finish Skill继续通过实际Git、业务工具与各专业接口保持边界。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Terminal Delivery 模块必须隔离旧 Finish 历史
**Reason**: 用户授权删除旧Finish历史而不是继续隔离读取。
**Migration**: 删除Terminal Delivery及其CLI/Web投影，不新增历史adapter。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
