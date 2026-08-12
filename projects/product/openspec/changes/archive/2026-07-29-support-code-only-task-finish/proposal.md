## Why

Buildr 已允许 `code-only + implementation` 使用 canonical task environment，也允许纯 `metadata-only` 任务直接在 retained canonical Workspace 完成，但 Task Finish 仍把 receipt-bound environment 与 active OpenSpec Change 同时作为硬前置条件。这使合法的无 Change 候选在用户要求“收尾”时进入死路，并迫使 Agent 手工组合 Git 操作。

## What Changes

- 让 receipt-bound task environment 中的无 Change 候选以 task identity 进入同一 Task Finish 五阶段执行器；Change/OpenSpec 专属检查和收敛动作明确返回 `not-applicable`，其余候选冻结、验证、交付和清理保证保持不变。
- 让 Task Finish Skill 在 retained canonical Workspace 的无 Change metadata-only 场景正式交接给 selected `buildr.git-single-operation/v1` provider，并要求显式任务文件范围、无关改动隔离、验证证据和逐项 Git 结果；不把 retained dirty tree 直接塞入产品执行器。
- 调整 CLI 输入与帮助，使首次 `task finish run` 继续要求 `--project` 和 receipt-bound task environment，但只在 Change 候选中要求 `--change`。
- 增加 contract、unit、fast integration 与真实 product journey 覆盖，证明 Change 与 code-only 两种候选不会互相退化，metadata-only handoff 不会混入无关改动。
- 本次不包含破坏性变更；现有带 `--change` 的调用和完成回执继续兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 扩展 Task Finish 的候选种类、适用门禁、Change 专属阶段和完成证据语义。
- `agent-task-workflows`: 定义无 Change task environment 的统一收尾，以及 retained canonical metadata-only 候选向 Git 单项能力的正式安全交接。
- `cli-product-surface`: 调整 Task Finish canonical help 与参数诊断，准确表达 `--change` 的条件必需性。

## Impact

- 修改 Buildr Service 的 Task Finish application、run identity、preflight/prepare executor、结果与 completion receipt，以及对应 CLI help。
- 修改随包 `task-finish` Skill 与 `buildr.task-finish/v1` contract，并保持 `git-ops` 的单项操作授权和文件隔离边界。
- 扩展 Task Finish CLI、unit、contract、fast integration 和 product journey 测试。
- 更新 Buildr Service/current workflow knowledge，说明 Change 候选与无 Change 候选的分流及 `not-applicable`/handoff 语义。
