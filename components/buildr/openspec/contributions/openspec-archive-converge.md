## Buildr OpenSpec Convergence Boundary

Buildr Workspace不允许通过上游`openspec-archive-change`直接移动Change，也不允许以用户确认跳过未完成tasks、delta sync或deterministic convergence。用户要求归档时，使用Agent已核对的当前Workspace或matching Worktree根，转用单一`buildr openspec converge <change> --project <project> --target <actual-work-root> --json`事务。

只有 converge 返回 passed 或幂等 archived，才报告 canonical sync/archive 已完成。Agent 随后重新观察归档结果、代码和专业结果继续工作；不生成研发回执或规划身份。失败时报告 reason、evidence 与 next actions。Convergence Inspect 只适用于未决事务现场。
