---
name: task-worktree
description: 用户明确要求创建、检查或清理 Task 的 Git worktree 与本地任务分支，或 Task Environment 需要 Git checkout provider 时使用；不负责环境 ready、恢复、Runtime、资源或总 cleanup。
---

# Task Worktree Skill

本 Skill 是 `buildr.git-worktree-provider/v1` 的默认 provider，只管理 Git checkout 和窄 Git evidence。正式任务的完整执行环境由 `buildr.task-environment/v1` 管理。

## 公共动作

```bash
buildr worktree create <task-id> --target <canonical-workspace> --branch <branch> --start-point <ref> [--include <selector>] --json
buildr worktree inspect <task-id> --target <canonical-workspace> --json
buildr worktree cleanup <task-id> --target <canonical-workspace> [--integrated-ref <selector>=<ref>] --json
```

root 固定为 `<workspace-root>/.worktrees/<task-id>`；独立 Project/Service repository 放在其 canonical nested source path。不得静默回退到 `/tmp`。

## 结果与边界

结果只包含 repository selector、source/checkout path、branch、start point、HEAD、clean/registered/remote、精确 Git effects 与 diagnostic。`.buildr/worktrees/<task-id>.json` 只保留 Git provider evidence，不是 Environment Receipt。

本 Skill 不判断 Task 是否 ready，不准备 Runtime、CLI、依赖或 projection，不登记动态资源，不记录 Agent session，也不承担恢复或环境总 cleanup。验证交给 `task-verification`，已选定 Git Operation 的安全边界交给 `git-operations`，正式任务环境交给 `task-environment`。

## 停止条件

repository selector、path、Git common directory、remote、branch ownership、registered worktree 或 evidence identity 冲突时停止。任一 checkout dirty、集成 ref 无法证明或清理会影响其他 checkout 时保留现场。删除远端分支、丢弃工作和非 Git 资源需要其他明确授权。
