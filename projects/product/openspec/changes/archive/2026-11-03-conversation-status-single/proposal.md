## Why

待决策与执行中并列造成重复提示，用户要求只保留待决策。需要调整既有双标签约定；无接口或数据破坏性变更。

## What Changes

列表与提醒只显示一个状态，待决策优先；真实执行统计保持不变。

## Capabilities

### Modified Capabilities
- `agent-conversations`: 待决策标签不再追加执行中。

## Impact

共享状态组件、列表及提醒调用方和渲染测试；无持久状态或后端变更。
