## Why

受管 Codex 程序更新等待旧执行释放时，Harness 并行交接会把暂时占用判为候选失败。旧后台应保持可用，候选应在占用解除后自动接续。

## What Changes

- 保留已登记的候选并公开程序更新等待原因。
- 等待期间允许已核验的旧后台继续接收指令；切换时沿用已有派发保护。
- 资源释放后自动接续同一候选，实际启动失败继续按失败处理。

## Capabilities

### Modified Capabilities

- `agent-runtime-activation`：支持受管程序更新期间延迟交接。

## Impact

涉及 Harness 执行后台及其客户端。沿用既有候选记录，无存储迁移。
