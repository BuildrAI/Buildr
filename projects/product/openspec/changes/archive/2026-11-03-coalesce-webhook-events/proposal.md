## Why
流式文字导致每分钟约 200 次通知，掩盖真正的状态变化。

## What Changes
- 仅在回复完成时发送完整正文。
- 状态、工具与卡片变化即时发送，过滤纯版本与流式增量。
- 新增独立 task_started、status_changed、reply，保留兼容事件。

## Capabilities
### Modified Capabilities
- `outbound-conversation-webhooks`: 推送语义粒度与事件分类。

## Impact
仅影响出站通知与相关测试；不修改任务数据，不重启服务。
