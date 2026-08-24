## Why

正式无代码协调 Task 可以合法以 `completed + noChange=true` 结束，但 Task Environment cleanup 目前只接受 Delivery evidence 或 abandon，导致这类 Task 的受控 checkout 与分支无法由唯一 owner 清理。这个缺口已经阻塞候选版恢复任务，必须在继续发布前修复，并用完整生命周期回归防止再次出现“Task 已完成但环境永远不能清理”的状态。

## What Changes

- 允许 Task Environment Application 从 current Task Record 的 `completed + noChange=true` 终态导出 no-change cleanup 资格。
- 要求 Git worktree provider 独立证明 checkout 干净且 HEAD 未偏离 Environment evidence；dirty 内容或新增提交必须 fail closed。
- 保持普通 `completed + noChange=false` Task 仍要求可复核 Delivery evidence，abandon 仍走既有授权路径。
- 增加 active → completed no-change → cleanup cleaned 的生命周期回归，以及 dirty/HEAD drift 负向回归。
- 更新 CLI/Skill/Capability contract 表述，使公开入口不能接受 caller-authored no-change provider result。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`: 增加 completed no-change Task 的受控 cleanup 资格与 Git fail-closed 证明要求。
- `cli-product-surface`: 明确 public cleanup 只由 Application 从 current Task Record 派生 no-change 资格，CLI 不接收调用方伪造的 provider 结论。

## Impact

- Task Environment Application 与 Git worktree provider cleanup 路径。
- `task environment cleanup` 的内部授权语义；公共命令参数不变。
- Task Environment capability contract、随包 Skill 与 OpenSpec canonical specs。
- Task Environment integration 和 Git provider contribution integration 回归。
