---
name: task-finish
description: 用户要求“收尾”或交付已验证的 Change/code-only 候选时使用；retained metadata-only 可安全交接 Git 单项操作，产品缺陷返回研发流程。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口，调用固定五阶段执行器。它不由 Agent 编排阶段、补 evidence 或设计 recovery。

## 边界

“修复产品缺陷”不是收尾动作。开始前应已完成研发、自审、必要审查、开发验证和 current knowledge；最终 assurance 只确认 frozen candidate 可交付。

发现产品缺陷时报告具体失败并结束 Finish，回到研发修正，形成新候选后重启；不得在当前 run 修改实现、申请 repair authorization 或重新验证。

收尾授权覆盖适用收敛、commit、目标分支交付、retained 更新和 Task-owned cleanup；force push、改写共享历史、丢弃用户改动或远端任务分支操作仍不授权。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace；调用 `buildr task environment inspect <task-id> --target <canonical-workspace> --json`，必须得到 matching `ready`。
2. 核对 Environment 返回的实际 scope、validation root、执行 CLI 与 controller identity；不从 cwd、分支或旧 worktree receipt 推断。
3. 检查本任务的 asset observation；如存在，先调用 selected `buildr.task-asset-review@3` provider finalize。结果为 `awaiting-human` 时停止，不进入产品 Finish run。
4. 用户排除 push、retained install 或 cleanup 而改变交付语义时停止；执行器不支持拆分。

不要替产品收集 fingerprint、evidence、execution plan、repair authorization 或 recovery manifest。
Agent 不创建版本化运行目录；产品只写入自身 canonical Finish Receipt 与恢复事实。

## 执行

从 Environment 登记的稳定 controller 调用一次：

```bash
buildr task finish run --task <task-id> --project <project-code> [--change <change-id>] --target <canonical-workspace> --json
```

Project policy 要求时增加 `--required-assurance candidate`。只有已有摘要绑定同一 frozen candidate、Workspace Node identity 与 assurance 时才传 `--verification-summary`；否则由产品执行最终 assurance。

产品顺序执行：

```text
preflight → prepare → verify → deliver → cleanup
```

- `failed` 且 `nextWorkflow: task-development`：报告 phase/operation/check，返回研发；不恢复 run。
- `blocked`：只使用结果中的 `runId` 与 `resume.token` 重复同一 canonical 命令；不得手写或修改 token，也不得重做已通过阶段。
- `complete`：报告 verification、delivery、Environment cleanup result 与 metrics。

cleanup 前产品先持久化 delivery/completion facts，再把各 scope 的 delivery identity 交给 Task Environment。Environment 独占资源停止、Git provider cleanup、共享根解除占用和 cleanup 结论；Finish 不直接调用 worktree cleanup 或写第二份环境结论。

恢复使用 `buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json`；只读查看使用 `buildr task finish inspect --run <run-id> --target <canonical-workspace> --json`。

## 完成标准

- 五个固定阶段全部 `passed` 或 `not-applicable`；
- frozen candidate 与正式验证、交付和 Environment cleanup identity 一致，Workspace Node identity 未漂移；
- 正常路径 `canonicalCliInvocations = 1`、`agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions <= 1`；
- 没有把研发返工、修复或重新验证计入 Finish 时间。
