# human-readable-change-brief Specification

## Purpose
定义正式 OpenSpec Change 的人类可读 Brief、权威边界、生命周期兼容性和只读展示要求。

## Requirements

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
