## Why

已提交未受理的待发送记录未参与活动查询，导致对话消失或存储成功与执行混淆。

## What Changes

从已有记录派生等待发送、发送失败，计入活动并保留原因和取消边界；真实模型执行及待决策独立统计。无新增持久状态或存储迁移，无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 未受理及失败提交的活动展示。

## Impact

Agent Service的只读列表投影与可选activity字段，Web浮窗、历史及待发送卡片。现有Skill保存和取消约定继续适用，列表展示不产生提交授权。
