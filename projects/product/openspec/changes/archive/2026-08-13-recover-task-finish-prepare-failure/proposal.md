## Why

Task Finish 在原 Task source 含未提交的 OpenSpec 归档重命名时，会把已经不存在的旧路径作为精确 pathspec 交给 Git，导致 `prepare` 在创建 carrier 前失败。该失败既没有产生交付副作用，也无法由新的 current handoff 安全取代，使任务永久卡在 `current-run identity conflict`；需要补齐快照与恢复契约。

## What Changes

- 让 Task source snapshot 正确表达当前工作树中的新增、修改和删除，包括 active Change 移入 archive 后旧路径已不存在的情况，不修改原 Task index 或工作树。
- 将“可由新 handoff 安全取代”的旧 run 从仅限 `preflight-only` 收敛为可证明无副作用的 `preflight` 或 `prepare` 失败。
- 对任何 carrier、lease、阶段 operation、delivery、retained activation、cleanup 或无法分类的副作用证据继续 fail closed，并返回 current-run identity conflict。
- 增加覆盖未提交归档重命名、零副作用 prepare 失败和存在副作用证据失败的回归测试。
- 不包含破坏性变更；既有可恢复 run、resume token、Delivery Adaptation 和已产生副作用的 owner facts 保持原语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：明确 Task source snapshot 对删除路径的处理，并允许可证明无副作用的 prepare 失败由新的 current handoff 安全取代。

## Impact

- 规范：`task-finish-execution`。
- 实现：Git Task Contribution snapshot、Task Finish current-run replacement/side-effect classification。
- 测试：Task Finish application、Git contribution snapshot 和产品级恢复场景。
- 不改变 npm CLI 参数、SQLite schema、Finish 五阶段、正式 Verification 或发布流程。
