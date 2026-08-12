## Why

任务资产 observation 当前保存在用户级 Application Support 中，与它所属的 Workspace 分离，用户难以发现、理解和维护；同时现有 lifecycle helper 不能结构化表达无候选丢弃、独立新任务 handoff 和完成证据，容易让接受、资产修改、维护记录与 observation 删除发生错序。

## What Changes

- **BREAKING** 将 observation 从用户级共享状态迁移到 canonical Workspace 的 `.buildr/asset-review/`，并由根 `.gitignore` 保证该运行状态始终 untracked。
- 同一 Workspace 的主 checkout 与 task worktree 必须解析到 canonical Workspace 的同一 observation 目录；不同物理 Workspace checkout 即使 `workspace.id` 相同也不共享运行状态。
- 为已有用户级 observation 提供安全迁移：仅迁移 identity 匹配且目标不冲突的文件，冲突或损坏时 fail closed 并保留来源。
- 补齐无合格候选时的确定性 `discarded` 终态，避免把已经完整覆盖或已在原任务解决的信号再次升级为人工候选。
- 强化 accept、handoff 与 complete 状态机：accept 只记录人工决定；handoff 必须指向独立后续任务；Rule、Skill、capability Contract 只有提供 tracked maintenance record 和集成证据后才能完成，product follow-up 只有提供 OpenSpec 吸收证据后才能完成。
- 将 provider contract 升级为 `buildr.task-asset-review/v3`，同步 Task Finish consumer、Buildr 入口 routing、Skill、helper、模板、manifest、测试和产品文档。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-asset-observation-lifecycle`: 修改 observation 的 authority、共享范围、迁移、状态机与完成证据要求。
- `task-asset-promotion`: 修改无候选丢弃、独立 handoff 和接受后写回的可验证边界。

## Impact

- OpenSpec canonical specs：`task-asset-observation-lifecycle`、`task-asset-promotion`。
- Capability：新增 `buildr.task-asset-review/v3` 并迁移 `task-finish` optional consumer binding。
- 随包资产：`task-asset-review`、`task-finish`、Buildr 入口 Skill、contracts、manifests、templates 和 `.gitignore` baseline。
- 实现与验证：`observation.mjs`、contract/package/runtime adapter tests、临时 Workspace 与真实 task worktree 路径场景。
