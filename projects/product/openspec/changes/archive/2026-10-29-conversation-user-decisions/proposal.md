## Why

工作对话已有问题卡片及准确本轮答复能力，但 Codex 普通执行没有启用原生提问工具，智能体（Agent）只能用文字询问而未进入等待。用户已要求复用现有卡片，补齐需要用户决定时等待、回答后继续的交互。

## What Changes

- 为 Codex 工作对话启用默认执行模式（Default Mode）中的原生提问能力，并明确必要决定应通过该能力发起、等待回答后继续依赖它的工作。
- 复用现有问题卡片、`waiting-question`、独立答复和执行身份保护；普通文字与补充消息不被推断为问题或回答，完全访问不代替业务决定。
- 原生问题取消或失效时及时移除卡片，迟到答复不交付其他请求或轮次；页面重新读取保留有效问题。
- 辅助标题、交接摘要继续无工具生成，不继承工作对话的提问设置。不包含破坏性变更，不迁移历史，不重发正在运行的工作。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：明确普通工作对话的必要用户决定必须使用有效问题、等待准确回答并接续原轮，取消与辅助生成保持隔离。

## Impact

- `services/buildr-agent/src/executors/codex/` 的工作对话配置、原生请求生命周期及专项检查。
- 现有 `ConversationRequest`、对话应用（Conversation Application）和独立答复入口继续作为交互实现；根据检查仅修复必要衔接，不另建决定状态或页面。
- 不增加外部依赖、公开接口（API）或执行权限。任务说明见[任务说明](@task/conversation-user-decisions)。
