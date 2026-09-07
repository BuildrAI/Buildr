## REMOVED Requirements

### Requirement: Task planning identity 必须来自 closed 语义投影
**Reason**: 该identity只服务Development planning和可选Review，独立模块收益不足。
**Migration**: Agent直接读取current OpenSpec artifacts并选择真实Review subject。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 非语义执行事实不得改变 target identity
**Reason**: 不再由Application自动比较planning currentness。
**Migration**: Agent判断checkbox、provenance或内容变化是否影响审查结论。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 无法可靠解析时必须保守阻塞
**Reason**: parser与route整体退役。
**Migration**: OpenSpec strict validation和semantic preflight继续报告实际语义问题。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Result 必须保持 response-only
**Reason**: Result与Application整体退役。
**Migration**: 不新增替代Result。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
