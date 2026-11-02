## ADDED Requirements

### Requirement: 任务列表采用标题优先的简洁展示

任务列表 MUST 保留任务标题与必要状态，MUST NOT 展示目标摘要或目标悬停浮窗；任务详情 MUST 仍可查看完整目标。

#### Scenario: 浏览与打开任务
- **WHEN** 用户浏览列表、悬停任务标题并打开详情
- **THEN** 列表 MUST 不弹出目标浮窗或展示目标摘要，详情 MUST 保留完整目标
