## Why

task environment 已由 `buildr worktree context` 确定性返回 canonical `workspaceRoot`，但 task-board 仍要求 Agent 在 receipt 与显式 Workspace identity 之间选择并自行解析，重复了产品能力并浪费推理时间。应让 provider 直接消费 context 的唯一输出，无法取得有效绑定时 fail closed。

## What Changes

- task-board 在 task environment 中必须调用 environment-bound `buildr worktree context --target <environment-root> --json`。
- 只允许使用成功 context 结果的 `workspaceRoot` 作为 retained Workspace 写入根。
- 禁止读取 receipt 结构、自行向上扫描或接受显式 identity 作为 environment 内 fallback。
- 增加 contract test，防止重新引入分支式解析指导。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-board`: 将 task environment 到 retained Workspace 的定位改为消费 `worktree context.workspaceRoot`。
- `task-board-maintenance`: 明确 consumer/provider 的确定性 context 输入与 fail-closed 语义。

## Impact

影响 task-board Skill、`buildr.task-board-maintenance/v1` contract、canonical specs、产品说明、package/runtime 投射和 contract tests。不改变 `worktree context` JSON schema，也不迁移既有看板。
