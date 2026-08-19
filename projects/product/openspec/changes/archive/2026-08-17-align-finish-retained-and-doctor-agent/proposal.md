## Why

正式收尾时，retained 主工作区可以落后目标远端很多可快进提交，Finish 仍能创建 run，直到 `deliver` 才报 `retained-workspace-not-ready`。同时调用方常把当前聊天宿主写成 `--agent`，而 Doctor 必须跟随 Environment 已绑定 adapter。需要把这两项确认前移到首次交付副作用之前，避免空转的 run 和错误宿主 Doctor。

## What Changes

- Finish `preflight` 必须观察 retained 当前符号分支与目标远端是否可快进对齐；未对齐时 fail closed、零 delivery mutation，并给出可恢复事实（behind / diverged），而不是等到 `deliver`。
- 用户在轻量确认后明确授权继续时，仍允许走现有 `deliver` 对齐路径；本 Change 不删除 `deliver` 的 retained 收敛，只把“尚未观察远端”从后置失败改成入口门禁。
- Finish Doctor 必须使用 Environment Receipt 已绑定的 adapter。调用方传入的 `--agent` 若存在，必须与该 adapter 一致，否则 `entry_gaps`；省略 `--agent` 时产品使用 Environment adapter，不得猜测当前聊天宿主。
- Task Finish Skill 必须要求 Agent 在调用 `task finish run` 前完成上述确认，不得用会话宿主覆盖 Environment adapter。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `task-finish-execution`: `preflight` 增加 retained/远端对齐观察；Doctor 绑定 Environment adapter。
- `agent-task-workflows`: Finish 调用约定改为先确认 retained 对齐，且 `--agent` 跟随 Environment。
- `cli-product-surface`: `task finish run` 的 `--agent` 与 Environment adapter 一致性进入公开 CLI 契约。

## Impact

- 受影响：Task Finish Application/CLI、`task-finish` Skill、retained Doctor 调用、相关 system/integration 测试。
- 不改变 Development handoff、Candidate、Verification 或 Task Record 语义。
- 不把 GitHub 短超时探测或共享 Skill 回执修复并入本 Change（分属另外两个 active Task）。
