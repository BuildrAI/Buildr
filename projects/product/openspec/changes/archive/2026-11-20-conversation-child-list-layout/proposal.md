## Why

已有子对话在提醒浮窗与完整列表中看不出归属，用户需要在原有行样式下直接辨认父子关系。

## What Changes

- 同一工作空间中同时可见的子对话，紧跟直接父对话并缩进。
- 保留活动条件、筛选、分页、统计和条目操作；无数据迁移或接口破坏性变更。

## Capabilities

### Modified Capabilities

- `agent-conversations`：提醒浮窗和完整对话列表的可见行布局。

## Impact

Harness Web 调整既有两个入口的展示，Harness 提醒数据沿用已有父子关系字段；不改变执行、筛选、分页或对话窗口。
