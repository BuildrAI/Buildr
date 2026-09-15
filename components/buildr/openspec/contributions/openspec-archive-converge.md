## Buildr 规范归档接入

写入前执行 `task-triage` 的默认隔离策略，复用当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。

用户已授权归档时，在已核对的实际工作根调用 `buildr openspec converge <change> --project <project> --target <actual-work-root> --json`。该命令检查相关变更冲突，复用锁定上游执行规范写入与归档，并保留必要中断恢复。不再另行手工同步后移动目录。

只在命令返回 passed 且实际归档成立时报告成功；失败时保留已经发生的效果。使用 `buildr openspec convergence inspect` 检查中断现场，不用归档状态替代业务交付或测试结论。只同步请求由独立同步入口处理。
