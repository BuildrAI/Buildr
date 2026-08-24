## Why

当前 Parent Task 的创建动作只正确地写入了 Task Record，但内置 Skills 没有把“创建并准备 Parent”稳定解释为一个连续的专业交接。Agent 可能在记录创建后过早返回，把“已创建”误报为“已准备好启动 Child”，导致用户必须再次要求补齐 Environment、Development、Parent Plan、Planning Review 与 planning refresh。

## What Changes

- 保持 `task create` 与 Task Record Application 的单一 writer 边界，不新增跨 Task、Environment、Development、Review 的聚合写命令。
- 让 `task-manager` 在 active Parent 创建成功且用户意图包含创建、准备或拆分 Parent 时，自动交接 `task-development`，而不是把 Task Record 成功当作流程终点。
- 让 `task-development` 默认持续消费 `buildr task next`，按返回的 owner/action 推进 Parent 启动准备，直到 `start-child-contribution`；只有真实 blocker、信息不足或需要用户业务决定时停止。
- 在 Parent 目标、架构决定、Contribution Map、依赖、边界和最终验收信息已具备时，立即将其写入 Parent Plan，并完成 current Planning Review 与 planning refresh；不重复询问已知事实。
- 到达 Child 前停止点后，统一报告 Parent 已准备好，并展示 eligible Contributions 供用户选择第一个 Child；不自动创建 Child。
- 增加 Skill 契约测试，覆盖自动交接、next 消费循环、停止语义和 Task Record writer 隔离。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 明确 active Parent 创建后的默认完整准备、跨 Skill 自动交接、`task next` 消费循环与 Child 前停止点。

## Impact

- 受影响的源资产：`task-manager`、`task-development`、`task-triage` Skills 及其随包 workspace 投影。
- 受影响的规范与验证：`agent-task-workflows` canonical spec、OpenSpec delta、Skill contract tests。
- 不改变 `buildr.task-record/v2`、`buildr.task-development/v2` capability contract，不改变 Task Record、Environment、Development 或 Review Application writer。
- 不新增 CLI 命令、数据库字段、迁移、外部依赖或破坏性变更。
