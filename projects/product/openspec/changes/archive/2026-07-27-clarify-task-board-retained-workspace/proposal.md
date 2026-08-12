## Why

任务看板覆盖完整 Project task，并可关联多个具有独立生命周期的 OpenSpec Change 与 task environment；当前 Skill 的“Project 所在环境”表述可能让 Agent 把看板写入某个临时 task environment，造成所有权、唯一性和清理后的可用性错误。现在需要把 retained Workspace checkout 明确为任务看板的唯一维护位置。

## What Changes

- 明确任务看板的稳定路径必须相对于 retained Workspace checkout 解析和写入。
- 禁止在关联 Change 的 task environment 中创建、复制或更新任务看板；task environment 只作为事实来源。
- 当调用发生在 task environment 中时，要求解析其 receipt 对应的 canonical Workspace，并对 retained checkout 的 Project 路径执行冲突与写入检查。
- 补充 capability contract、Skill、产品规范和自动化回归检查。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-board`: 明确任务看板由 retained Workspace checkout 唯一持有，不随关联 Change 的 task environment 分叉。
- `task-board-maintenance`: 将 retained Workspace identity 和写入位置加入 consumer/provider 协作契约。

## Impact

影响 Workspace `task-board` Skill、`buildr.task-board-maintenance/v1` contract、Buildr Product canonical specs、package 投射及 task-board contract tests。不迁移或改写既有任务看板，也不改变 task environment 的代码、验证和 Change artifact 边界。
