## REMOVED Requirements

### Requirement: 提供者明确的多对多关联

**Reason**: 用户授权移除全部外部桌面关系。
**Migration**: 删除 Buildr 旧关系及历史，不迁移或备份，内部对话和任务保留。

### Requirement: 兼容旧数据与局部失败

**Reason**: 用户授权移除全部外部桌面关系。
**Migration**: 删除 Buildr 旧关系及历史，不迁移或备份，内部对话和任务保留。

### Requirement: 按关系版本解除与打开

**Reason**: 用户授权移除全部外部桌面关系。
**Migration**: 删除 Buildr 旧关系及历史，不迁移或备份，内部对话和任务保留。

## ADDED Requirements

### Requirement: 外部会话关系必须停止恢复并清理

系统 MUST 不再建立、查询或恢复 Codex、DSH 的外部会话（Session）任务关系。正式应用启动时 MUST 清理已登记工作空间（Workspace）的固定旧关系文件，不迁移、不备份；链接或写入锁等异常 MUST 只影响对应清理，不删除其指向对象，不阻断无关工作。内部对话的可选任务（Task）引用 MUST 保持独立。

#### Scenario: 启动后不再恢复旧关系
- **WHEN** 正式应用启动且存在旧关系文件
- **THEN** 系统 MUST 按固定范围删除可安全处理的旧文件，不恢复外部关系，内部对话与任务保持
