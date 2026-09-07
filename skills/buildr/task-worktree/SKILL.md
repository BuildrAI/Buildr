---
name: task-worktree
description: 用户或上游Agent明确要求为Task创建、检查或安全清理Git worktree与本地任务分支时使用；只管理Git位置和删除安全。
---

# Task Worktree Skill

本 Skill 是 `buildr.git-worktree-provider/v1` 的默认 provider，只管理Git checkout、本地任务分支、窄Git evidence和具体删除安全。普通任务可以直接在已确认的当前checkout工作，不要求先创建Worktree。

## 公共动作

```bash
buildr worktree create <task-id> --target <canonical-workspace> --branch <branch> --start-point <ref> [--include <selector>] --json
buildr worktree inspect <task-id> --target <canonical-workspace> --json
buildr worktree cleanup <task-id> --target <canonical-workspace> --expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit> [...] --json
```

root 固定为 `<workspace-root>/.worktrees/<task-id>`；独立 Project/Service repository 放在其 canonical nested source path。不得静默回退到 `/tmp`。

## 结果与边界

结果只包含 repository selector、source/checkout path、branch、start point、HEAD、clean/registered/remote、精确Git effects与diagnostic；长期只保留 Git provider evidence。evidence位于Git common-dir的`buildr/task-worktrees/<task-id>.json`，不是Task状态或交付证明。

创建前完整预检全部repository，部分创建失败保留已完成效果并允许相同plan重试。清理前Agent先核验完整交付，再成对提供全部受管repository的source与delivered完整提交；provider复核source版本、dirty、registration和delivered提交仍由非任务retained ref持有。

本Skill不判断 Task 是否 ready、完成或业务成果是否等价，不准备 Runtime、CLI、依赖或 projection，不记录 Agent session，不管理Preview、容器或其他资源。验证交给`task-verification`，已选定Git Operation的写入安全交给`git-operations`，其他资源交给各自owner。

## 停止条件

repository selector、path、Git common directory、remote、branch ownership、registered worktree 或 evidence identity 冲突时停止。任一 checkout dirty、集成 ref 无法证明或清理会影响其他 checkout 时保留现场。删除远端分支、丢弃工作和非 Git 资源需要其他明确授权。
