## Why
自动接续指令是给智能体的，不应打断用户阅读或重复占据对话正文。

## What Changes
- 正常对话静默处理自动重试与后台恢复的内部接续指令。
- 展开处理过程可查看简短结果；失败、未知结果与停止能力保留。

## Capabilities
### Modified Capabilities
- `agent-conversations`：区分内部自动接续指令与用户可见执行状态。

## Impact
仅调整 Harness Web 呈现；不修改执行、授权、存储与历史接口。
