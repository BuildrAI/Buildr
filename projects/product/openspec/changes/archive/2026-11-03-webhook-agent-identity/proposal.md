## Why
Grok Bot 接收事件时需要稳定的发送方身份。

## What Changes
所有 webhook payload 统一添加 agent.name 与 agent.id；不使用平行的顶层 agentName、agentId、source。

## Capabilities
### Modified Capabilities
- `outbound-conversation-webhooks`: 增加发送方身份。

## Impact
统一序列化出口、相关测试与架构说明；不修改任务数据，不激活运行服务。
