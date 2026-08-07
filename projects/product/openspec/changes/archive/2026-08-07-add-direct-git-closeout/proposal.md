## Why

当前用户在没有 active Task Record 的对话中说“收尾”时，会被路由到 Formal Task Finish；由于缺少 Development handoff 和 ready Environment，整个 Git 交付也被一起阻止。这样把“正式 Task Finish 的证据门禁”和“当前 Workspace 的 Git 交付”错误地绑定在了一起。

需要补充一条无 Task 的直接 Git 收尾路径：复用现有 Git Operations 安全边界，根据 Workspace 当前事实完成 rebase、精确 commit 和 push，同时明确不产生正式 Task 生命周期证据。

## What Changes

- 将 Task Finish 的意图范围收窄为已有 active formal Task、current Development handoff 和 ready Environment 的正式收尾。
- 增加无 active Task 时“收尾”的直接 Git 交付路由，解析当前 repository、分支、remote、目标 ref 和 dirty scope。
- 在事实唯一且授权足够时支持 `fetch → 必要时精确 commit → rebase → push` 的直接工作流；rebase 冲突、目标歧义、无关 dirty、共享历史改写和 force push 继续 fail closed。
- 直接 Git 收尾只报告 Git Operation Result，不创建临时 Task、Environment、Verification、Candidate、Finish Result 或 Task terminal status。
- 保持 `buildr.git-operations/v1` contract identity 不变；由 Buildr 产品入口决定“收尾”意图、目标与操作顺序，Git Operations provider 继续只执行已选定的 operation。

## Capabilities

### New Capabilities

- `direct-git-closeout`: 无 active Task 时，根据 Workspace Git 事实完成当前工作树的安全 Git 交付，并报告独立 operation 结果。

### Modified Capabilities

- `agent-task-workflows`: 明确“已有 formal handoff 的收尾”进入 Task Finish，“无 active Task 的收尾”进入直接 Git 交付。

## Impact

- Product runtime Buildr Skill 的任务路由和直接 Git 收尾说明。
- workspace `task-finish` 与 `git-operations` Skill 的发现描述和操作边界说明。
- Product OpenSpec capability specs、package asset consistency checks 和 contract/routing tests。
- 不修改 `buildr.task-finish/v1` 或 `buildr.git-operations/v1` 的 major identity，不新增数据库、Task Record writer 或 Git Operation Receipt。
