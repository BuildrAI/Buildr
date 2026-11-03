## Why

浮窗按活动时间推导空间顺序，与支持手动排序的对话列表不同，切换入口容易找错位置。

## What Changes

- 浮窗沿用列表的工作空间排序偏好，默认空间仍最后，只显示有活动条目的组。
- 列表调整顺序即时通知浮窗，同页和同配置跨页签同步。
- 组内沿用待处理优先、最近用户输入倒序与稳定身份次序。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 统一两入口的空间顺序及同步。

## Impact

仅 Buildr Web 排序偏好、活动浮窗和回归测试；不修改后端或执行控制。复用原存储键，无迁移。
