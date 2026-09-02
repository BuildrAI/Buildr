## Buildr OpenSpec Convergence Boundary

Buildr Workspace 不允许通过上游 `openspec-archive-change` 直接移动 Change，也不允许以用户确认跳过未完成 tasks、delta sync 或 deterministic convergence。用户要求归档时，停止上游 archive 流程，从matching Task Environment Receipt读取`execution.workdir`，转用单一 `buildr openspec converge <change> --project <project> --target <task-execution-root> --json` 事务；不得把canonical Workspace当作target或自动搜索其他worktree。

本 consumer 不机械声明 Task Record、Task Environment、Task Development 或 current knowledge dependencies；这些事实由实际入口 Skills 与各自 Application 维护。只有 converge 返回 passed 或幂等 archived 结果时，才报告 canonical sync/archive 已完成并停止恢复检查；正式Task随后重新调用Task Planning Identity resolver，`resolved`时更新Development planning，`blocked`时停止对应mutation。Review是否需要重做由Agent独立判断。失败时不得确认绕过，必须报告 reason、evidence 与 next actions。Convergence Inspect只适用于仍存在的未决事务现场，不是archive、Finish或cleanup后的门禁。
