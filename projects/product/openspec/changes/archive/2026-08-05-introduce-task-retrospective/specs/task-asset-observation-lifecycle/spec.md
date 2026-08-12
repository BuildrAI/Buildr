## REMOVED Requirements

### Requirement: Buildr 按 Workspace 隔离共享任务资产观察
**Reason**: Buildr 不再维护过程 observation。
**Migration**: 旧目录原样保留且不再读取；新复盘写入 Workspace SQLite。

### Requirement: Observation 保存最小可审查状态
**Reason**: 第一版只保存 terminal Task 的自由 Markdown current Result。
**Migration**: 不迁移旧 observation。

### Requirement: Observation 写入保持单任务所有权
**Reason**: observation writer 已退役。
**Migration**: Task Retrospective Application 以 task_id 维护单一 current row。

### Requirement: 人工决定控制 Observation 去向
**Reason**: 第一版没有 accept/reject 或 observation 去向。
**Migration**: 优化建议的后续行动由用户另行发起 Task。

### Requirement: 只有实际资产变更保留维护历史
**Reason**: Task Retrospective 不维护资产历史。
**Migration**: 既有资产维护记录保持历史事实。

### Requirement: Buildr 安全迁移用户级 legacy Observation
**Reason**: 新能力明确不迁移任何旧 observation。
**Migration**: 旧用户级与 Workspace 数据均保持原样且 inert。

### Requirement: Observation MVP 不引入后台系统
**Reason**: observation MVP 已整体退役。
**Migration**: 新 Task Retrospective 仍不引入 Hook、daemon、watcher、事件总线或完整轨迹存储。
