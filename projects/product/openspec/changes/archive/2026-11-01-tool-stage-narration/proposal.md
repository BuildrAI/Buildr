## Why

工具密集的工作对话可能长时间只有工具记录，缺少用户可读的意图和进展。用户已确认以统一交互说明改善所有内置接入，而非恢复内部思考展示。

## What Changes

- 在每段工具执行前要求输出简短可见说明，交代动作及目的；同一目的的连续调用共用说明，换阶段或方向时更新。
- 使用用户语言，不以内部思考、机械工具名称或等待批准代替说明。
- 不增加工具拦截、模型参数或界面变更；无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：增加跨接入的工具执行前说明约定。

## Impact

共用 `interactionPolicy.instructions` 及其现有 Codex、DSH、Qoder 消费者。增加必要回归检查，保留现有持久化、授权、恢复和辅助标题摘要隔离；不修改原生应用全局配置。
