## Why

原生智能体压缩上下文期间缺少可见输出，用户无法区分正常压缩与执行卡住。接入已有原生生命周期，提供真实等待反馈，不触发额外模型操作。

## What Changes

- 在原执行下显示压缩阶段、持续时间，完成后恢复正常展示。
- 接入 Codex、DSH、Qoder 原生事件，隔离旧轮次和子智能体。
- 终态、停止和不确定观察清除进行中提示；可靠观察支持重连恢复。
- 不增加主动压缩指令、不猜测进度、不改变授权和执行状态。无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 原生上下文压缩阶段的准确展示与恢复。

## Impact

影响 buildr-agent 的执行契约、三个原生适配器、对话读模型，以及 buildr-web 的对话提示和对应回归测试。复用现有事件传输和持久化，不新增依赖。任务说明见 [任务说明](@task/agent-context-compaction)。
