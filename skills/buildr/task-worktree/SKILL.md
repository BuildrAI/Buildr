---
name: task-worktree
description: 按任务分流的默认隔离策略或用户要求，为任务创建、复用检查或安全清理 Git worktree 与本地任务分支时使用；只管理 Git 位置和删除安全。
---

# Task Worktree Skill

本 Skill 是 `buildr.git-worktree-provider/v1` 的默认 provider，只管理Git checkout、本地任务分支、窄Git evidence和具体删除安全。执行位置选择遵循[任务分流的默认隔离策略](../task-triage/SKILL.md#默认隔离)；本技能（Skill）承接创建、复用检查与清理，不自行放宽主开发分支写入例外。

## 公共动作

```bash
buildr worktree create <task-id> --target <canonical-workspace> --branch <branch> --start-point <ref> [--include <selector>] --json
buildr worktree inspect <task-id> --target <canonical-workspace> --json
buildr worktree cleanup <task-id> --target <canonical-workspace> --expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit> [...] --json
```

root 固定为 `<workspace-root>/.worktrees/<task-id>`；独立 Project/Service repository 放在其 canonical nested source path。不得静默回退到 `/tmp`。

新选择的任务标识（Task ID）默认使用简短、稳定的语义名称，不主动添加日期；已有任务标识（Task ID）及用户指定的合法名称继续沿用，不截去日期或自动重命名。同名但不同的任务先核对归属，再用简短语义后缀区分，不复用他人位置。OpenSpec 归档日期只属于归档目录，不改变工作树（Worktree）或分支名称，也不替代交付核验和清理条件。

## 结果与边界

结果只包含 repository selector、source/checkout path、branch、start point、HEAD、clean/registered/remote、精确Git effects与diagnostic；长期只保留 Git provider evidence。evidence位于Git common-dir的`buildr/task-worktrees/<task-id>.json`，不是Task状态或交付证明。

创建、检查与清理按当前有效能力绑定（Capability Binding）交给已选提供者（Provider），并核对既有创建归属、真实登记及证据。绑定变化不自动转移历史资源归属；新提供者（Provider）不能识别既有证据或满足本契约（Contract）时，保留现场并报告差异，不另建同任务副本、迁移、补造登记或混用清理入口。

创建前完整预检全部repository，部分创建失败保留已完成效果并允许相同plan重试。清理前Agent先核验完整交付，再成对提供全部受管repository的source与delivered完整提交；provider复核source版本、dirty、registration和delivered提交仍由非任务retained ref持有。

本Skill不判断 Task 是否 ready、完成或业务成果是否等价，不准备 Runtime、CLI、依赖或 projection，不记录 Agent session，不管理Preview、容器或其他资源。验证交给`task-verification`，已选定Git Operation的写入安全交给`git-operations`，其他资源交给各自owner。

## 停止条件

repository selector、path、Git common directory、remote、branch ownership、registered worktree 或 evidence identity 冲突时停止。清理时目标 checkout dirty、集成 ref 无法证明或删除会影响其他 checkout 时保留现场。创建不要求主目录干净；复用检查保留同任务未提交内容。删除远端分支、丢弃工作和非 Git 资源需要其他明确授权。
