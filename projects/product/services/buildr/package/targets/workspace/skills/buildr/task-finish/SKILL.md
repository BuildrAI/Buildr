---
name: task-finish
description: 用户要求“收尾”、完成任务或自动完成已验证 Change 的归档、集成、推送与安全本地清理时使用；通过持久化 finish run 渐进执行并支持跨 session 恢复。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口。它把本轮“收尾”作为一次性授权，用 `buildr task finish inspect|advance|resume` 持久化进度，并调用 selected providers；专业政策不在此复制。

## 开始与采用

先确认 task/change、目标分支、远端、提交范围与排除动作；默认只 push 已集成目标分支。创建或继续稳定 run id：

```text
buildr task finish advance --run <run-id> --task <task-id> --change <change-id> --target-branch <branch> --remote <remote> --target <workspace> --json
```

默认在同一用户对话中用明确 target/workdir 与 checkout-local CLI 操作 task environment。后台 session/subagent 只是可选载体，task/change/run 不变；不得要求用户切换 UI，或伪造 Codex/Buildr worktree adoption。

## 推进

读取 checkpoint，执行 `nextAction`，再用同一 attempt、fingerprint、effects 与 evidence 提交 `passed` 或 `blocked`。正式保证只在 canonical、target、runtime 收敛后执行，级别由 task-verification provider 决定。

<!-- buildr:skill-contributions pre-verification -->

<!-- buildr:skill-contributions pre-spec-sync -->

<!-- buildr:skill-contributions post-spec-sync -->

失败后运行 `resume`，只重跑 blocked/stale 及其下游；fingerprint 未变的 passed 副作用不得重复。tree、远端 observation 或 provider 输入变化时更新 fingerprint。共享资源只使用 CLI 短 lease，不创建 Workspace 全局锁。

## 授权与停止

“收尾”授权已披露的归档、任务提交、目标分支集成/push、入口迁移和安全本地清理；不授权 force push、远端任务分支操作、丢弃改动、改写共享历史或语义冲突。provider blocked、evidence 不可信、target race 或 cleanup 不安全时保存 blocked。

asset review 返回 `awaiting-human` 时在 cleanup 前等待；optional provider 不可用则记录降级。不得删除其他任务 worktree、preview、进程或用户状态。

## 完成

完成前用 `inspect` 核对全部 passed。报告 identity、验证与耗时、effects、archive/commit/integration/push、runtime/doctor、cleanup、未触碰环境和风险。cleanup 失败不得重做远端动作。
