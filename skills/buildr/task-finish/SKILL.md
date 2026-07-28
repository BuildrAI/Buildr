---
name: task-finish
description: 用户要求“收尾”、完成已验证任务，或自动执行 Change 收敛、目标分支交付与 task environment 安全清理时使用；只接收已具备收尾资格的候选，产品缺陷返回研发流程。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口。它调用产品的固定五阶段执行器，不由 Agent 编排阶段、补 evidence 或设计 recovery。

## 边界

“修复产品缺陷”不是收尾动作。开始前应已完成研发、自审、必要审查、开发验证和 current knowledge 维护；Finish 内的最终 assurance 只确认 frozen candidate 是否可交付。

最终 assurance、OpenSpec convergence、target convergence 或候选稳定性发现产品缺陷时，报告产品返回的具体失败并结束当前 Finish。回到研发、审查和测试验证流程修正当前实现，形成新的 finish-ready candidate 后再开始新的 Finish；不得在当前 run 修改实现、申请 repair authorization 或重新验证。

收尾授权只覆盖常规 Change 收敛、生成资产收敛、candidate commit、目标分支集成/push、retained runtime 更新和 task-owned 本地清理。force push、改写共享历史、丢弃用户改动、远端任务分支操作和语义冲突决策仍不授权。

## 调用前

1. 确认当前目录属于 receipt-bound task environment，并读取 task/change、Project、Agent、Workspace Node identity 与目标分支事实；`executionReady` 必须已核对 Node identity。
2. 检查本任务的 asset observation；如存在，先调用 selected `buildr.task-asset-review@3` provider finalize。结果为 `awaiting-human` 时停止，不进入产品 Finish run。
3. 确认用户没有排除 push、retained install 或 cleanup 等正常动作；排除项会改变交付语义时停止并说明当前执行器不支持拆分执行。

不要替产品收集 fingerprint、attempt、effect、evidence、execution plan、repair authorization 或 recovery manifest。

## 执行

在 task environment 内用 receipt-bound CLI 调用一次：

```bash
buildr task finish run --change <change-id> --project <project-code> --target <task-environment> --json
```

只有 Project policy 要求完整候选保证时增加 `--required-assurance candidate`。只有已有验证摘要明确绑定同一 frozen candidate identity、Workspace Node identity 与 assurance 时才传 `--verification-summary <file>`；否则让产品执行一次最终 assurance。

产品依次执行：

```text
preflight → prepare → verify → deliver → cleanup
```

- `failed` 且 `nextWorkflow: task-development`：报告具体 phase/operation/check，结束收尾并回到研发；不恢复当前 run。
- `blocked`：只使用结果中的 `runId` 与 `resume.token` 重复同一 canonical 命令。不得手写或修改 token，也不得重做已通过阶段。
- `complete`：报告 verification、delivery、completion receipt 与 metrics。

恢复命令：

```bash
buildr task finish run --run <run-id> --resume <product-token> --target <task-environment> --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <workspace-or-task-environment> --json
```

客户端直接使用唯一 canonical `runs`、`completed` 与 lease namespace，不创建版本化运行目录。旧 run shape 不可恢复；不得加载、解释、迁移或执行旧协议。

## 完成标准

- 五个固定阶段全部 `passed` 或 `not-applicable`；
- frozen candidate 与正式验证、交付和 cleanup receipt identity 一致，且 Workspace Node identity 从 freeze 到 deliver 未漂移；
- 正常路径 `canonicalCliInvocations = 1`、`agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions <= 1`；
- 没有把研发返工、修复或重新验证计入 Finish 时间。
