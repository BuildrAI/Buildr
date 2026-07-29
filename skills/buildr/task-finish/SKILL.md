---
name: task-finish
description: 用户要求“收尾”或交付已验证的 Change/code-only 候选时使用；retained metadata-only 可安全交接 Git 单项操作，产品缺陷返回研发流程。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口，调用固定五阶段执行器；不由 Agent 编排阶段、补 evidence 或设计 recovery。

## 边界

“修复产品缺陷”不是收尾动作。开始前应已完成研发、审查、开发验证和 current knowledge；最终 assurance 只确认 frozen candidate 可交付性。

发现产品缺陷时报告产品的具体失败并结束 Finish，回到研发修正，形成新候选后重启；不得在当前 run 修改实现、申请 repair authorization 或重新验证。

收尾授权覆盖适用收敛、commit、目标分支集成/push、retained 更新和 task-owned 清理；force push、改写共享历史、丢弃用户改动、远端任务分支操作仍不授权。

## 调用前

1. 用 `buildr worktree context --target <current> --json` 确定 context。task environment 从 receipt 读取 task、可选 Change、Project、Agent、Node identity 与目标分支，并要求 `executionReady`；有 Change 为 `change`，否则任务必须已确认为 `code-only`。
2. 检查本任务的 asset observation；如存在，先调用 selected `buildr.task-asset-review@3` provider finalize。结果为 `awaiting-human` 时停止，不进入产品 Finish run。
3. 用户排除 push、retained install 或 cleanup 而改变交付语义时停止；执行器不支持拆分。

不要替产品收集 fingerprint、evidence、execution plan、repair authorization 或 recovery manifest。

## Task environment 执行

在 task environment 内用 receipt-bound CLI 调用一次：

```bash
buildr task finish run --project <project-code> [--change <change-id>] --target <task-environment> --json
```

Project policy 要求时增加 `--required-assurance candidate`。只有已有摘要绑定同一 frozen candidate、Node identity 与 assurance 时才传 `--verification-summary`；否则由产品执行最终 assurance。

产品依次执行：

```text
preflight → prepare → verify → deliver → cleanup
```

- `failed` 且 `nextWorkflow: task-development`：报告 phase/operation/check，返回研发；不恢复 run。
- `blocked`：只使用结果中的 `runId` 与 `resume.token` 重复同一 canonical 命令。不得手写或修改 token，也不得重做已通过阶段。
- `complete`：报告 verification、delivery、receipt 与 metrics。

code-only 以 receipt task 为主身份；产品将 Change checks/OpenSpec convergence 报为 `not-applicable`，Agent 不创建虚假 Change。

恢复只用 `buildr task finish run --run <run-id> --resume <product-token> --target <task-environment> --json`；只读查看用 `buildr task finish inspect --run <run-id> --target <workspace-or-task-environment> --json`。

客户端使用唯一 canonical `runs`、`completed` 与 lease namespace，不创建版本化运行目录；旧 shape 不恢复或迁移。

## Retained metadata-only 交接

context 为 `worktree.not_task_environment` 时产品执行器不适用。仅当任务明确为 metadata-only、位置是 retained Workspace、任务 paths 可从本轮证据精确列出、验证匹配当前内容且 branch/remote 明确时继续，否则 blocked。

披露任务 paths、排除的 dirty paths、commit message、目标分支与 push 影响，确认 selected `buildr.git-single-operation@1` provider ready，再分别交接精确 commit 和 push。provider 只能 stage 任务 paths，不得 `git add -A`、stash、回滚或提交无关状态；每步返回 repository、ref/commit/remote 与 `treeChanged`，最终报告 `completionMode: git-single-operation-handoff`。provider 或 identity 不可证明时不得手写 Git 回退。

## 完成标准

- 五个固定阶段全部 `passed` 或 `not-applicable`；
- frozen candidate 与正式验证、交付和 cleanup receipt identity 一致，且 Workspace Node identity 从 freeze 到 deliver 未漂移；
- 正常路径 `canonicalCliInvocations = 1`、`agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions <= 1`；
- 没有把研发返工、修复或重新验证计入 Finish 时间。
- metadata-only handoff 保留无关 dirty changes，返回逐项 Git evidence。
