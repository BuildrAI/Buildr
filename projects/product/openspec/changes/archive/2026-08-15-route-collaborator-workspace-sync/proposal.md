## Why

当协作者推送使 canonical `dev` 前进时，本地可能没有对应 Task 或 Formal Finish；这属于正常的 Workspace update。当前规范虽要求 tree 变化后运行 Doctor 并允许 workspace sync，但没有明确排除 self-bootstrap activation，Agent 可能把“协作者更新后的 runtime projection stale”误判为本地 Finish 后续动作。

## What Changes

- 为协作者远端更新建立明确分类：Git 已检出 tree 前进且没有匹配的本地 Finish Result 时，归类为普通 Workspace update。
- 要求 Agent 在该分类下消费 Doctor findings；只有当前 Agent 的 managed workspace/runtime projection stale 时，路由 Buildr Skill 执行一次 `buildr sync <agent> --target <workspace-root>`。
- 明确 `buildr-self-bootstrap-sync` 只接受匹配的 Formal Finish Result/run，Task 不存在或不是本地任务不能作为异常或自举依据。
- 增加 Skill 路由契约测试，覆盖协作者更新、匹配 Finish、自举不适用和非 sync Doctor blocker。
- 不改变 Git、Task、Finish、Doctor 或 workspace sync 的 authority，也不增加新的持久状态。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 明确协作者更新后的 Workspace update 分类、workspace sync 路由和 self-bootstrap 排除条件。

## Impact

- `agent-task-workflows` canonical spec 与当前认知。
- Buildr、task-triage、buildr-self-bootstrap-sync 的 builtin Skill 源和 capability description。
- Skill trigger/route contract tests；不新增公共 CLI 或数据库 schema。
