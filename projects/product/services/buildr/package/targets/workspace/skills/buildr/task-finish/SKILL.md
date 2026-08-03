---
name: task-finish
description: 用户要求“收尾”或交付已有 current formal Development handoff 时使用；只准备内容等价 carrier、推进 retained target 并清理 Environment，handoff/Candidate/Result 问题返回 Task Development。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的窄入口。它不编排 Development、Review 或 Verification，也不手写 Receipt。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace，通过 `task-environment` 确认 matching ready Environment。
2. 通过 `task-development` Application inspect current formal handoff；必须能取得精确 handoff、Candidate、Content Target identities 和 proceed decision。
3. handoff missing/stale、Change 仍未处置、Verification/Completion 不完整或风险未获接受时停止，返回 Task Development；Finish 不补齐这些事实。
4. Development handoff必须已闭合适用的资产决定；Finish不读取或finalize asset observation。用户排除push、retained install或cleanup而改变交付语义时停止。

## 执行

从 canonical retained Workspace 的可信 Environment Manager 调用：

```bash
buildr task finish run --task <task-id> --target <canonical-workspace> --json
```

产品固定执行：

```text
preflight → prepare → verify → deliver → cleanup
```

五阶段由产品连续执行，不由 Agent 编排阶段、补 evidence 或设计 recovery。

- `preflight` 只核对 current handoff、Environment、carrier adapter 与 retained target。
- `prepare` 只创建内容等价 Delivery Carrier。当前 Git adapter 可以 stage/commit 相同内容，但不运行 OpenSpec、runtime generation、rebase、Candidate freeze 或任何测试。
- `verify` 只证明 carrier 与 handoff Content Target 等价，`formalVerificationExecutions` 必须为 `0`。
- `deliver` 只做 fast-forward target transition、push 与交付后的 retained sync/install/Doctor。
- `cleanup` 把 delivery identity 交给 Task Environment；不直接删除 provider 状态或写第二份 Environment 结论。

`failed` 且 `nextWorkflow: task-development` 时报告 phase/operation 和 identity mismatch，回到 Development，不修复或恢复 run。`blocked` 只使用产品返回的 `runId` 与 `resume.token` 重试；不得手写 token或重做已通过阶段。

恢复命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <canonical-workspace> --json
```

## 禁止事项

Finish 不创建、递增、回退或复用 Candidate generation；不修改 Development Receipt；不收敛/同步/归档 Change；不改变 Candidate 内容；不发起 Task Verification 或 Completion Review；不决定 proceed/blocked；不接受用户风险。任何一项需要发生都退出到 `task-development`。

## 完成标准

- 五阶段全部 passed/not-applicable；
- Result 明确引用 Development handoff、Task Candidate、Content Target 和 Delivery Carrier；
- carrier equivalence 为 current，target 仅 fast-forward，Environment cleanup 完成；
- `agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions = 0`。
