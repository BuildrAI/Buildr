## REMOVED Requirements

### Requirement: Buildr 必须提供任务看板维护能力契约
**Reason**: 没有生产 consumer，contract 只支撑已退役的 `task-board` Skill 与 Task Triage 分支。

**Migration**: 删除 `buildr.task-board-maintenance/v1`、provider 与 binding。需要 Task 事实的 consumer 只能调用 Task Record、Development、Review、Verification 等专业 Application 的公开 read model。
