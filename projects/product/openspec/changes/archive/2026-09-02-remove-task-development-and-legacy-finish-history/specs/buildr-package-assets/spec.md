## ADDED Requirements

### Requirement: Package 必须完整退役 Task Development、Planning Identity 与旧 Finish 历史
Package manifest、workspace resources、Application Payload、CLI/runtime route inventory和installed-layout MUST不包含Task Development Skill/contract/provider、Task Planning Identity或旧Finish/Terminal Delivery入口。

#### Scenario: 构建候选package
- **WHEN** package verification检查resource inventory和installed runtime
- **THEN** 退役文件、binding、route、schema和help MUST不存在
- **AND** 保留Task与OpenSpec能力 MUST继续可用

## REMOVED Requirements

### Requirement: 产品验证覆盖 Task Finish 收尾契约
**Reason**: 该Requirement覆盖已删除的旧Finish Application契约。
**Migration**: 默认Skill-only收尾由task-closeout与Git/Task/Environment测试覆盖。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Buildr package 必须交付 Task Planning Identity consumer闭环
**Reason**: Task Planning Identity整体退役。
**Migration**: 删除route、Skill引用和installed-layout检查。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Package 必须验证正式工作流内部路由闭环
**Reason**: 旧Requirement把Task Development和Planning Identity列为required routes。
**Migration**: route inventory只保留实际存在的Task Retrospective等内部入口。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
