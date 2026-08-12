## Buildr OpenSpec Convergence Boundary

Buildr Workspace 不允许通过上游 `openspec-sync-specs` 直接写入 canonical specs。用户要求同步 delta 时，停止上游 agent-driven sync，转用单一 `buildr openspec converge <change> --project <project> --target <workspace> --json` 事务；不得恢复旧 pre-sync/post-sync 序列，也不得把 Task lifecycle capabilities 机械声明为本 consumer 的依赖。

Knowledge reconcile、Change checklist、proposal/delta classification 与直接验证属于 apply 和 Development 在调用 converge 前的义务。只有 converge 返回 passed 或幂等 archived 结果时，才报告 canonical sync/archive 已完成并停止恢复检查；正式Task随后必须重新调用Task Planning Identity resolver，target相同才复用current Planning Review，不同或`blocked`时停止并重审。失败时原样报告 reason、evidence 与 next actions。Convergence Inspect只读取仍存在的未决事务Receipt，不在正常archive或环境清理后运行。
