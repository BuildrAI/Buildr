---
name: task-worktree
description: 按任务分流的默认隔离策略或用户要求，为任务创建、复用检查或安全清理 Git worktree 与本地任务分支时使用；只管理 Git 位置和删除安全。
---

# Task Worktree Skill

本 Skill 是 `buildr.git-worktree-provider/v1` 的默认 provider，只管理Git checkout、本地任务分支、窄Git evidence和具体删除安全。执行位置选择遵循[任务分流的默认隔离策略](../task-triage/SKILL.md#默认隔离)；本技能（Skill）承接创建、复用检查与清理，不自行放宽主开发分支写入例外。

## 公共动作

```bash
buildr worktree create <task-id> --target <canonical-workspace> --branch <branch> --start-point <ref> [--include <selector>] --json
buildr worktree inspect <task-id> --target <canonical-workspace> [--observed-checkouts <json-file>] --json
buildr worktree cleanup <task-id> --target <canonical-workspace> --expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit> [...] [--observed-checkouts <json-file>] --json
```

新建 root 固定为 `<workspace-root>/.worktrees/<task-id>`；独立 Project/Service repository 放在其 canonical nested source path。不得静默回退到 `/tmp`。

新选择的任务标识（Task ID）默认使用简短、稳定的语义名称，不主动添加日期；已有任务标识（Task ID）及用户指定的合法名称继续沿用，不截去日期或自动重命名。同名但不同的任务先核对归属，再用简短语义后缀区分，不复用他人位置。OpenSpec 归档日期只属于归档目录，不改变工作树（Worktree）或分支名称，也不替代交付核验和清理条件。

## 结果与边界

结果只包含 repository selector、source/checkout path、branch、start point、HEAD、clean/registered/remote、精确Git effects与diagnostic；长期只保留 Git provider evidence。evidence位于Git common-dir的`buildr/task-worktrees/<task-id>.json`，不是Task状态或交付证明。

创建、检查与清理按当前有效能力绑定（Capability Binding）交给已选提供者（Provider）。接手智能体（Agent）须核对任务授权、实际归属及当前 Git 身份；更换智能体（Agent）或缺少历史登记不能成为放弃接续的理由。已有证据冲突时保留现场；仅缺少证据时使用下方当前对象输入重新核验，不另建同任务副本、迁移或补造创建历史。绑定变化本身不转移资源归属，也不授权混用不兼容入口。

创建前完整预检全部repository，部分创建失败保留已完成效果并允许相同plan重试。清理前Agent先核验完整交付，再成对提供全部受管repository的source与delivered完整提交；provider复核source版本、dirty、registration和delivered提交仍由非任务retained ref持有。

本Skill不判断 Task 是否 ready、完成或业务成果是否等价，不准备 Runtime、CLI、依赖或 projection，不记录 Agent session，不管理Preview、容器或其他资源。验证交给`task-verification`，已选定Git Operation的写入安全交给`git-operations`，其他资源交给各自owner。

## 缺少历史登记时接续

从实际 Git 和本次任务范围核对每个来源与检出位置，把完整对象集合写入本次临时 JSON 文件，并向 `inspect`、`cleanup` 传入 `--observed-checkouts`：

```json
[
  {
    "selector": "workspace",
    "sourceRepository": "/absolute/workspace",
    "checkoutPath": "/absolute/existing-checkout",
    "branch": "codex/task-name"
  }
]
```

必须提供规范绝对路径；独立项目（Project）和服务（Service）逐项使用真实 `project:<code>`、`service:<project>/<service>` 与当前来源，嵌套路径保持与来源一致。已有位置可使用实际路径，创建默认目录不变。先检查完整集合，再核验交付、正在进行的工作以及需要保留的忽略文件；清理继续成对传入全部源与交付提交（Commit）。锁定、其他检出位置占用、未知嵌套代码库（Repository）、未保存内容或版本变化仍会阻止删除。

文件只描述本次观察，不是永久登记或创建证明。提供者（Provider）返回 `evidenceSource: stored|observed`，观察路径的 `startPoint` 为 `null`，不写入历史证据。已有记录损坏或身份冲突时，不能用当前对象覆盖。没有记录又没有明确对象时返回诊断，不能报告已清理；只有实际删除或逐项确认不存在后才能返回 `cleaned`。

部分删除后沿用同一对象集合和已重新核对的交付版本重试。核对每项 `effects`，区分本次删除、确认不存在和仍需处理的内容；不能以一句备注代替未完成的收尾。

## 停止条件

repository selector、path、Git common directory、remote、branch ownership、registered worktree 或 evidence identity 冲突时停止。清理时目标 checkout dirty、集成 ref 无法证明或删除会影响其他 checkout 时保留现场。创建不要求主目录干净；复用检查保留同任务未提交内容。删除远端分支、丢弃工作和非 Git 资源需要其他明确授权。
