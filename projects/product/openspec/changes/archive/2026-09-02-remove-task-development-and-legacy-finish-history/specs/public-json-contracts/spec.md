## ADDED Requirements

### Requirement: Public JSON registry不得包含退役任务研发与旧收尾schema
Buildr public JSON registry、CLI help、HTTP DTO和checkout/npm parity MUST不包含Task Development、Task Finish legacy result、Task Finish compact/self-bootstrap或Terminal Delivery schema。

#### Scenario: fresh build检查JSON catalog
- **WHEN** generator和contract verification读取current catalog
- **THEN** 已删除schema和operation MUST不存在
- **AND** Task Record、Environment、Review、Verification与Retrospective schema MUST继续通过

## REMOVED Requirements

### Requirement: Task Finish run 必须提供 portable execution record operation summary
**Reason**: 旧Finish Result不再读取。
**Migration**: 删除对应JSON schema与projection。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish compact schema 必须由自动覆盖保护
**Reason**: compact history projection退役。
**Migration**: 删除registry和测试。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish 必须提供稳定的自举输入公开投影
**Reason**: 旧Finish self-bootstrap投影退役。
**Migration**: self-bootstrap只消费当前默认收尾形成的真实交付输入。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 自举输入版本必须独立于内部 Finish Result 演进
**Reason**: 对应旧Finish投影退役。
**Migration**: 不保留兼容major。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: self-bootstrap detail 必须纳入公开 JSON coverage
**Reason**: `task finish inspect --detail self-bootstrap`删除。
**Migration**: 删除coverage与help。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
