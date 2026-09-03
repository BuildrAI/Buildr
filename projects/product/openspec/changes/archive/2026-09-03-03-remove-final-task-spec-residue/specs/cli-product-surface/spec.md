## REMOVED Requirements

### Requirement: Worktree CLI 必须与 Task Environment CLI 分离
**Reason**: Task Environment CLI已删除，当前不存在两个CLI需要并列区分。
**Migration**: `worktree create|inspect|cleanup`由Git Worktree provider规范独立维护。

### Requirement: Parent Coordination CLI必须公开planning refresh
**Reason**: planning refresh与Parent Plan writer已退役。
**Migration**: 只保留`task parent inspect`。

### Requirement: Parent Plan CLI必须提供输入discoverability
**Reason**: Parent Plan写入CLI已删除。
**Migration**: 计划使用Task intent或已有可读文档。

### Requirement: Parent Plan CLI 必须发现 v2 并稳定区分计划与运行事实
**Reason**: Parent Plan v2不再是当前运行事实。
**Migration**: `task parent inspect`只把旧计划标为历史内容。
