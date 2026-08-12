# 创建任务前收敛 dev 远端基线

## 一句话摘要

Agent 创建正式 Task 前，先让完整目标仓库集合的 clean `dev` 通过 `fetch origin dev` 与 `rebase origin/dev` 收敛；任一失败都阻塞创建并报告实际 Git effects。

## 背景与问题

当前 `task-triage` 会先创建 Task Record，再由 Task Environment 从本地 checkout 准备执行位置。Task Environment 按职责不自动同步源码，因此本地 `dev` 落后或分叉时，新任务可能从陈旧基线开始。

## 目标 / 非目标

目标是在 Agent 正式 Task create 分支建立统一 `dev` 基线门禁，并复用 Git Operations 的授权、停止条件和 Result。非目标是不改变 Task Record CLI/Application、Local App 或 Task Environment 的专业 authority，也不自动支持其他分支、remote、stash、merge 或 force push。

## 受影响用户或角色

- 通过 Agent 创建正式 Task 的 Buildr 使用者。
- 维护 `task-triage`、Git Operations 和 Buildr package/runtime parity 的产品开发者。

## 核心流程

`task-triage` 解析完整 repository set → 全量 preflight → 全量 fetch → 按稳定顺序 rebase → 适用 Workspace transition check → 全部成功后 Task Record create。失败时不创建 Task，并报告已发生 effects；clean pre-state 的 rebase 冲突可显式 abort，恢复成功仍保持 blocked。

## 关键变化

- 新 Task create 分支条件消费 `buildr.git-operations/v1`。
- 自动路径严格要求 clean `dev` 与 `origin/dev` upstream。
- 多仓库不伪造原子性，保留并报告部分成功。
- Task Record 与 Environment 不新增 Git 状态或副作用。

## 影响 / 风险 / 兼容性

该变化会阻止非 clean `dev`、错误 upstream 或 Git 收敛失败的 Agent Task 创建。直接 Task Record CLI 和已有 Task 恢复保持兼容。多仓库部分成功不会自动回滚，需要以 Result 中的 current facts 恢复。

## 验收摘要

- aligned、behind 与 clean 未 push 分叉仓库均先收敛再创建 Task。
- dirty、错误 branch/upstream、fetch/rebase/abort failure 均不创建 Task。
- Result 精确报告每个 repository 的 effects/current facts。
- package、capability graph、supported Agent runtime 与 canonical specs 一致。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Agent task workflows delta](specs/agent-task-workflows/spec.md)
- [Buildr package assets delta](specs/buildr-package-assets/spec.md)
- [Tasks](tasks.md)
