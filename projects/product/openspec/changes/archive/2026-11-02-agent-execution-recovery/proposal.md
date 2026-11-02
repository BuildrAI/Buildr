## Why

协议坏流尚未接入统一恢复，导致原目标中断。应统一执行故障事实与恢复决策，无破坏性变更。

## What Changes

- 执行器归一化协议、观察及进程故障。
- 服务层复用准确观察、资源释放、问题保护和持久恢复预算，接续原目标。
- 保留未知操作事实，不重放历史。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 执行异常统一恢复。

## Impact

影响Agent Service执行契约、故障诊断、三家执行器适配和恢复应用；无付费调用或应用更新。
