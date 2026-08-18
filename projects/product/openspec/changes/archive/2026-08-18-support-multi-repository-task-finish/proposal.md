## Why

当前 Task Environment 已能为同一任务登记多个独立 Git repository，但 Task Finish 仍只处理 Workspace 根 repository。部分 repository 没有任务贡献时，现实现还会把其 baseline HEAD 当作 Delivery Carrier 校验提交消息，造成无交付副作用的误失败，也使真正有贡献的 Service repository 无法进入正式交付。

## What Changes

- Task Finish 按 Environment 中的 repository set 逐一观察任务贡献，并为每个有贡献 repository 独立冻结交付目标、Delivery Baseline、Delivery Carrier、等价性、远端交付和回读事实。
- 无任务贡献的 repository 明确记录为 `not-applicable`，不创建或校验 Delivery Carrier，不执行分支推进、push 或远端回读；最终仍由 Task Environment cleanup 与其他 scope 一并清理其 worktree 和任务分支。
- 多仓库交付按确定性顺序执行，保留逐 repository 的完成与恢复事实；一个 repository 已交付后发生后续阻塞时，不伪装成原子回滚，也不重复交付已完成 repository。
- 修复无 tree delta 路径误校验 baseline HEAD 提交消息的问题；提交消息只校验由本次 Finish 创建或显式接管的 carrier commit。
- 补充部分 repository 无贡献、多个 repository 有贡献、目标前进、部分交付恢复和统一环境清理的正式测试。
- 保持 Task Environment 固定创建 Workspace 根 worktree 的现有方案，不改变 repository 发现和 Environment ownership。
- 本变更包含 Task Finish run/result 的受控结构扩展，但不改变公共 CLI 参数；旧单仓库 current 状态继续按原 shape 读取，新写入只使用新的多仓库结构。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 将当前 Git direct-to-target adapter 从单 repository 交付扩展为同一 Task Environment 内的多 repository 交付，并定义无贡献跳过、逐仓库恢复、远端证据和 cleanup 语义。
- `public-json-contracts`: 将 canonical full Task Finish Result 升级为 repository-set `v3`，同时保持 compact `v1` 和旧 `v2` 有界读取兼容。

## Impact

- 影响 Task Finish entry readiness、run/result domain schema、Product/Git phase executor、Git carrier adapter、SQLite current migration/compatibility reader、execution record 投影和 Environment cleanup handoff。
- 影响 Task Finish integration/system/contract tests、公开 full JSON contract，以及多 Git repository 的真实 journey fixture。
- 不改变 Task Environment 创建根 worktree 的行为，不新增 delivery adapter registry，不引入跨远端原子事务，不改变 Development Candidate、Verification 或 Review authority。
