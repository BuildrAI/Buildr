## REMOVED Requirements

### Requirement: 旧任务驾驶舱能力不再创建新产物
**Reason**: `task-cockpit → task-board` replacement 没有已发布消费方，且目标 Task Board 本身已退役。

**Migration**: 删除 replacement 声明和专属 upgrade 兼容测试；既有 `task-cockpits/*.html` 与 `task-boards/*.html` 均保持原路径和原内容，只作为历史旁证。
