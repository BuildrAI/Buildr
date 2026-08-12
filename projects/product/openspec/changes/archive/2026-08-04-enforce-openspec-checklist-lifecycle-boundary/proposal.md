## Why

P0.8 已把 OpenSpec convergence/archive 收回 Task Development 之前，但当前 OpenSpec apply contribution 仍把它描述为 Task Finish 职责，并允许 `tasks.md` 包含 archive 后才会发生的 Formal Development、Finish、Metadata Publication、Environment cleanup 与 Task terminal 动作。这会让已正式交付的 Task 留下不可修正的 `9/13` 历史 checklist，也让 `buildr openspec converge` 在存在未完成任务时仍可通过 `--yes` 归档。

## What Changes

- **BREAKING**：`buildr openspec converge` 在 active Change 的 `tasks.md` 仍有未完成 checkbox 时 fail closed，不再调用 `openspec archive --yes --skip-specs`。
- 收敛 OpenSpec propose/update/apply contribution：checklist 只能包含 Change disposition 前可完成的工作，不得包含归档后的 Task lifecycle 动作。
- 修正 apply contribution 中“Task Finish 执行 convergence/archive”的旧 authority，并明确 convergence/archive 在 stable Content Target 与 Formal Development 前完成。
- 增加 package/contract 与 convergence integration 负向验证，防止旧 authority 或 post-archive checklist 重新出现。
- 保持 Task Metadata Publication 边界不变；它继续只发布既有 portable Task records，不解释或改写 OpenSpec checklist。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-deterministic-sync`: convergence transaction 在 canonical apply 前检查 checklist completeness，未完成时零 canonical/archive 写入并返回精确诊断。
- `agent-task-workflows`: OpenSpec Component-owned workflow contributions 必须把 Change checklist 限定在 disposition 前，并明确归档后 lifecycle authority 不进入 `tasks.md`。
- `buildr-package-assets`: package/static/runtime parity 必须验证当前 OpenSpec contribution 不再路由 Task Finish convergence/archive，并包含 checklist 边界负向门禁。

## Impact

- Product source：`services/buildr/src/application/openspec/openspec-converge.mjs` 及必要的 checklist parser/helper。
- Workspace package source：OpenSpec Component 的 propose/update/apply contributions 与渲染后的 runtime parity。
- Verification：OpenSpec convergence integration、Task lifecycle contract/package static verification。
- 兼容性：历史 archived Change 保持原样；新 active Change 必须先完成或修订 checklist 才能 converge/archive。
