## Why

当前 Task Finish 为 Buildr 自举 sync 建立了 Project `task-finish.yml`、Service binding 和通用 `sync-workspace` activation，把单一自举 Workspace 的维护动作扩张成所有 Project 都要理解的产品契约。普通用户 Workspace 实际只需要在 canonical Rule、Skill、Component 或 Command 等 runtime source 变化后 render；Buildr package 到当前自举 Workspace 的同步应由该 Workspace 自己组合，而不是由通用 Task Finish 内核判断。

## What Changes

- **BREAKING**：移除 Project `task-finish.yml`、retained activation binding 与通用 `sync-workspace` 模式；Task Finish 不再为任何 Project 执行 package-to-Workspace sync 或 convergence commit。
- 通用 Task Finish 仅在 Task Contribution 命中 Workspace 根 runtime source 时，从 retained source 执行当前 Agent render 与 Doctor；其他变化不执行 runtime activation。
- 在通用 `task-finish` Skill 增加 `post-finish` Skill Contribution slot，但不增加产品 hook、任意命令或新的执行阶段。
- 在 Buildr 自举 Workspace 新增 `buildr-self-bootstrap` Workspace Component：它拥有专属 sync Skill 和追加到 `task-finish` 的 contribution，只在正式 Task Finish 成功后判断固定 package inputs并完成自举 Workspace 收敛。
- 自举收敛失败不推翻已交付 Candidate 或 Formal Task Finish Result，但 Agent 不得报告“完整收尾成功”，必须区分主任务已交付与 Workspace 收敛未完成。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: Task Finish 从通用三模式 retained activation 收窄为根 runtime source render；自举 sync 改为 Workspace Skill 组合。
- `buildr-package-assets`: 产品验证不再保护 Project activation declaration 和通用 sync convergence，而是验证通用 render 边界及自举 Workspace 资产组合。

## Impact

- Product canonical specs、current knowledge、Task Finish contract/Skill、CLI 文档和验证 registry/fixtures。
- `src/application/task-finish/` 中 activation planner、executor 的 deliver/cleanup 证据及 run/result schema兼容读取。
- 删除 `projects/product/task-finish.yml` 及其 package/static/layout 检查。
- 当前自举 Workspace 新增 Component、Skill 与 Skill Contribution 源资产；不修改 Component/Contribution 引擎，也不新增 capability contract、SQLite schema、Task Domain、Verification authority 或通用进程框架。
