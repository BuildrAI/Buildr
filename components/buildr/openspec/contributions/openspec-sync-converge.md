## Buildr OpenSpec Convergence Boundary

Buildr Workspace不允许通过上游`openspec-sync-specs`直接写canonical specs。用户要求同步delta时，使用Agent已核对的当前Workspace或matching Worktree根，转用单一`buildr openspec converge <change> --project <project> --target <actual-work-root> --json`事务。

当前认知 reconcile、Change checklist、proposal/delta classification 与直接验证属于调用 converge 前的工作。只有 converge 返回 passed 或幂等 archived，才报告 canonical sync/archive 已完成。Agent 随后重新观察当前 artifacts、代码和专业结果继续工作；不生成研发回执或规划身份。失败时原样报告 reason、evidence 与 next actions。Convergence Inspect 只读取仍存在的未决事务 Receipt。
