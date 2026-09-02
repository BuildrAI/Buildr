## REMOVED Requirements

### Requirement: Finish repository 必须支持按 Task 安全读取既有 completed Result
**Reason**: 用户接受丢失旧机器交付证据。
**Migration**: 删除repository、reader与`task_finish_current`，Task Record顶层结果保持不变。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish Result 必须报告只读解析上下文
**Reason**: 旧Result不再读取。
**Migration**: 不迁移或重建旧上下文。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish CLI detail 投影必须与执行 authority 分离
**Reason**: 旧CLI和Result投影整体退役。
**Migration**: 删除compact/full/self-bootstrap历史投影；当前self-bootstrap只消费新默认收尾的真实交付结果。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 旧收尾只允许读取历史
**Reason**: 历史读取也已获授权删除。
**Migration**: `task finish inspect`与旧资源读取直接退出，不保留兼容入口。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
