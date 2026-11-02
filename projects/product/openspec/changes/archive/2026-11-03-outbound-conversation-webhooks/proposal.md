## Why
用户需要在对话结束或等待人工参与时收到外部通知，无需持续轮询。新增确定性的单向通知，不引入外部控制权限。

## What Changes
- 新增可选出站 JSON Webhook、发送方鉴权、限时与去重。
- 不配置时关闭；无破坏性变更，无入站接口。

## Capabilities
### New Capabilities
- `outbound-conversation-webhooks`: 对话完成、失败、等待问题或审批的单向通知。
### Modified Capabilities
无。

## Impact
Agent service 的统一事件出口、新通知模块及测试；无依赖新增，无任务数据变更。配置与使用指引见 design.md。
