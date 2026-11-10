## Why
停止未确认时，用户只能重新读取而不能直接继续，形成无限等待；现有“可发送新要求”提示不能替代明确出口。现在补齐显式继续，不虚报已停止。

## What Changes
- 停止已请求的未知轮次提供“结束等待并继续”。
- 复用准确原轮身份的显式接续，强制独立参与者上下文并保留旧执行。
- 不要求资源释放证明，不重放旧输入，不代答问题；既有关闭对话限制不变。
- 无破坏性接口或存储变更。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `agent-conversations`: 停止未确认时的显式继续与独立上下文准入。

## Impact
影响 Agent Service 接续判断、Buildr Web 状态与按钮，以及单元和集成回归；复用现有 continueRunId、版本校验和发送幂等身份，不新增依赖。
