## REMOVED Requirements

### Requirement: 正式 Change 必须提供人类可读 Brief
**Reason**: 额外 companion 与数据库任务正文及标准变更材料重叠，停止生成与维护。
**Migration**: 每个任务使用 TaskRecord.brief，具体变化由 proposal/design/specs/tasks 表达，旧文件保留普通阅读。

### Requirement: Brief 不得成为第二套规范来源
**Reason**: 专用 Change Brief 增强退役，不再维护该来源。
**Migration**: 沿用既有标准材料的权威分工和独立数据库任务正文。

### Requirement: Brief 必须随 Change 生命周期保持稳定可读
**Reason**: 停止固定优先阅读入口与缺失警告，历史文件按普通文档保全。
**Migration**: 旧归档和既有链接保持普通安全阅读；无brief.md的变更正常展示标准产物，不自动回写。

## ADDED Requirements

### Requirement: Buildr 不得要求额外变更说明文件

Buildr MUST 停止为新建或修订变更生成、更新或专用读取 brief.md，MUST NOT 将缺失该文件视为错误、告警或阻止标准材料阅读。任务说明 MUST 只从 TaskRecord.brief 读取，具体变化 MUST 继续由既有 proposal/design/specs/tasks 表达。Buildr MUST 只调整自身增强，MUST NOT 改动外部 OpenSpec 的技能正文、模板、模式定义、命令实现或产物范围。

#### Scenario: 查看没有额外说明的变更
- **WHEN** active 或 archived 变更具有正常标准材料而没有 brief.md
- **THEN** Buildr MUST 显示可用标准材料且不返回专用 brief 模型或缺失警告，读取 MUST 零写入

#### Scenario: 浏览历史说明链接
- **WHEN** 用户通过已有链接查看旧归档或 active 变更中的 brief.md
- **THEN** Buildr MUST 通过既有受限普通文档读取展示原正文并保留来源身份及安全检查
- **AND** MUST NOT 自动复制到任务数据库、批量删除历史文件或恢复专用优先入口

#### Scenario: 上游组件保持原样
- **WHEN** Buildr 退役额外说明增强
- **THEN** OpenSpec 上游内容及其标准产物范围 MUST 保持原样，修改 MUST 限于 Buildr 增强和消费实现
