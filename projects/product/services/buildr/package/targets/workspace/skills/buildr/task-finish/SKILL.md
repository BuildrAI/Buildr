---
name: task-finish
description: 用户要求“收尾”或交付已验证的 Change/code-only 候选时使用；retained metadata-only 可安全交接 Git 单项操作，产品缺陷返回研发流程。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口，调用固定五阶段执行器。它不由 Agent 编排阶段、补 evidence 或设计 recovery。

## 边界

“修复产品缺陷”不是收尾动作。开始前应已完成研发、自审、必要审查、开发验证和 current knowledge；verify 只核对 frozen delivery target 的 current Task Verification Result，或执行一次声明中适用且交付必需的 command capabilities。

发现产品缺陷时报告具体失败并结束 Finish，回到研发修正，形成新候选后重启；不得在当前 run 修改实现、申请 repair authorization 或重新验证。

收尾授权覆盖适用收敛、commit、目标分支交付、retained 更新和 Task-owned cleanup；force push、改写共享历史、丢弃用户改动或远端任务分支操作仍不授权。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace；调用 `buildr task environment inspect <task-id> --target <canonical-workspace> --json`，必须得到 matching `ready`。
2. 核对 Environment 返回的实际 scope、validation root、provider/Task checkout evidence 与执行 CLI；不从 retained Buildr hash、cwd、分支或旧 worktree receipt 推断。
3. 检查本任务的 asset observation；如存在，先调用 selected `buildr.task-asset-review@3` provider finalize。结果为 `awaiting-human` 时停止，不进入产品 Finish run。
4. 用户排除 push、retained install 或 cleanup 而改变交付语义时停止；执行器不支持拆分。

不要替产品收集 fingerprint、execution plan、repair authorization 或 recovery manifest，也不要直接读写 Task Verification Result 文件。
Agent 不创建版本化运行目录；产品只写入自身 canonical Finish Receipt 与恢复事实。

## 执行

从 canonical retained Workspace 的可信 Environment Manager 调用一次：

```bash
buildr task finish run --task <task-id> --project <project-code> [--change <change-id>] --target <canonical-workspace> --json
```

产品顺序执行：

```text
preflight → prepare → verify → deliver → cleanup
```

- `failed` 且 `nextWorkflow: task-development`：报告 phase/operation/check，返回研发；不恢复 run。
- `blocked`：只使用结果中的 `runId` 与 `resume.token` 重复同一 canonical 命令；不得手写或修改 token，也不得重做已通过阶段。
- `complete`：报告 current Verification Result digest/applicability、delivery、Environment cleanup result 与 metrics。

verify 阶段通过同一 Task Verification Application inspect current Result。current、passed 且覆盖适用 `requiredForDelivery` capabilities 时复用；否则产品最多执行一次可确定的 command capability 集合、提炼 portable facts、record 完整 Result 并清理 transient execution evidence。临时 adapter 只按 Project/Service scope 与 path 匹配选择，不能解释自然语言 `conditions`，因此命中时保守执行而不据此跳过。多 Project、Agent capability、需要语义排除或无法形成完整 Task 结论时退出收尾，先完成正式 Task Verification；Finish 不写第二份 summary authority。

retained Workspace 的源码 global clean 按既定 Workspace Metadata Store 边界排除未 staged 的 `.buildr/**`；Finish 不 stage、commit、发布、修改或丢弃这些 metadata。任意源码/文档 dirty 或已 staged Workspace metadata 仍阻塞；exact owned-path publication 留给后续能力。

cleanup 前产品先持久化 delivery/completion facts，再把各 scope 的 delivery identity 交给 Task Environment。Environment 独占资源停止、Git provider cleanup、共享根解除占用和 cleanup 结论；Finish 不直接调用 worktree cleanup 或写第二份环境结论。

恢复使用 `buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json`；只读查看使用 `buildr task finish inspect --run <run-id> --target <canonical-workspace> --json`。

## 完成标准

- 五个固定阶段全部 `passed` 或 `not-applicable`；
- frozen delivery target 与 current Task Verification Result、交付和 Environment cleanup identity 一致，Workspace Node identity 未漂移；
- 正常路径 `canonicalCliInvocations = 1`、`agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions <= 1`；
- 没有把研发返工、修复或重新验证计入 Finish 时间。
