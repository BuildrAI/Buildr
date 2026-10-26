# native-session-association Specification

## Purpose
定义外部原生会话（Session）任务关系退役后的结果与清理边界：不再建立、查询或恢复 Codex、DSH 关系，固定旧数据不迁移或备份，内部对话和任务（Task）引用保持独立。

## Requirements

### Requirement: 外部会话关系必须停止恢复并清理

系统 MUST 不再建立、查询或恢复 Codex、DSH 的外部会话（Session）任务关系。正式应用启动时 MUST 清理已登记工作空间（Workspace）的固定旧关系文件，不迁移、不备份；链接或写入锁等异常 MUST 只影响对应清理，不删除其指向对象，不阻断无关工作。内部对话的可选任务（Task）引用 MUST 保持独立。

#### Scenario: 启动后不再恢复旧关系
- **WHEN** 正式应用启动且存在旧关系文件
- **THEN** 系统 MUST 按固定范围删除可安全处理的旧文件，不恢复外部关系，内部对话与任务保持
