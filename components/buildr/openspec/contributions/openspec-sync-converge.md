## Buildr OpenSpec Convergence Boundary

Buildr Workspace 不允许通过上游 `openspec-sync-specs` 直接写入 canonical specs。用户要求同步 delta 时，停止上游 agent-driven sync，从matching Task Environment Receipt读取`execution.workdir`，转用单一 `buildr openspec converge <change> --project <project> --target <task-execution-root> --json` 事务；不得把canonical Workspace当作target、自动搜索其他worktree、恢复旧 pre-sync/post-sync 序列或把 Task lifecycle capabilities 机械声明为本 consumer 的依赖。

Knowledge reconcile、Change checklist、proposal/delta classification 与直接验证属于 apply 和 Development 在调用 converge 前的义务。只有 converge 返回 passed 或幂等 archived 结果时，才报告 canonical sync/archive 已完成并停止恢复检查；正式Task随后必须重新调用Task Planning Identity resolver，`resolved`时更新Development planning，`blocked`时停止对应mutation。Review是否需要重做由Agent独立判断。失败时原样报告 reason、evidence 与 next actions。Convergence Inspect只读取仍存在的未决事务Receipt，不在正常archive或环境清理后运行。
