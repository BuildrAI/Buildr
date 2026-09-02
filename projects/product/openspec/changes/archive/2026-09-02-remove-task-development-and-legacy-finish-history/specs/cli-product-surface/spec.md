## ADDED Requirements

### Requirement: CLI 不得保留旧 Development、Planning Identity 或 Finish history入口
CLI registry与internal workflow router MUST不登记`__internal task-development`、`__internal task-planning-identity`、`task finish inspect`或`task delivery inspect`。调用旧命令 MUST返回标准unknown command且零副作用。

#### Scenario: 调用旧命令
- **WHEN** Agent调用任一已删除CLI或internal route
- **THEN** CLI MUST返回非零unknown command/route诊断
- **AND** Task Record、SQLite、Git和文件 MUST保持不变

## REMOVED Requirements

### Requirement: Task Finish canonical CLI 必须只有 run 与 inspect
**Reason**: 旧Finish执行已退役，历史inspect也删除。
**Migration**: 默认task-finish是Skill，不注册Task Finish Application CLI。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish CLI 失败必须直接定位并给出唯一 workflow
**Reason**: 对应旧CLI退役。
**Migration**: 实际Git、Task、Environment或业务工具各自返回诊断。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Agent CLI 必须支持按 Task 回读 Terminal Delivery
**Reason**: Terminal Delivery与旧Finish历史删除。
**Migration**: 使用`task inspect`读取顶层结果；机器交付不补造历史替代。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish CLI 必须显式限定零差异适配确认
**Reason**: 旧Finish run退役。
**Migration**: 默认收尾按实际Git/业务结果判断。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish run 必须只把 bootstrap recovery 暴露为显式 existing-run 选项
**Reason**: 旧run与recovery退役。
**Migration**: self-bootstrap只处理当前真实交付结果。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish run 必须只把 occupancy 释放暴露为显式 existing-run 选项
**Reason**: 旧run与lease退役。
**Migration**: 不保留occupancy compatibility入口。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Finish run 的 --agent 必须匹配 Environment adapter
**Reason**: 旧run命令退役。
**Migration**: Environment仍独立校验自己的adapter。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
