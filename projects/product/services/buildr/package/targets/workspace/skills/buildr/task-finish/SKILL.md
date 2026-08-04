---
name: task-finish
description: 用户要求“收尾”或交付已有 current formal Development handoff 时使用；只准备内容等价 carrier、推进 retained target 并清理 Environment，handoff/Candidate/Result 问题返回 Task Development。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的窄入口。它不编排 Development、Review 或 Verification，也不手写 Receipt。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace，通过 `task-environment` 确认 matching ready Environment。
2. 通过 `task-development` Application inspect current formal handoff；必须能取得精确 handoff、Candidate/generation、Content Target identities 和 proceed decision。
3. handoff missing/stale、Change 仍未处置、Verification/Completion 不完整或风险未获接受时停止，返回 Task Development；Finish 不补齐这些事实。
4. Development handoff必须已闭合适用的资产决定；Finish不读取或finalize asset observation。用户排除push、retained install或cleanup而改变交付语义时停止。
5. Git-backed run 默认使用 retained checkout 当前符号分支；显式 `--target-branch` 必须与它一致，Task Environment `startPoint` 不是交付分支 authority。产品再按显式 `--remote`、Environment evidence、target branch upstream、唯一配置 remote 的顺序解析真实 delivery remote；任一 identity 缺失、歧义或不一致时停止。

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
- `prepare` 在产品拥有的隔离交付载体（Delivery Carrier）中读取最新交付基线（Delivery Baseline），把原任务基线到 current source snapshot 的任务贡献（Task Contribution）机械应用为等价 commit；不得改写原 Task worktree/index/branch。
- `verify` 只证明 carrier、Task Contribution 与 handoff Content Target 等价，Candidate identity/generation 保持不变，`formalVerificationExecutions` 必须为 `0`。
- `deliver` 只做 fast-forward target transition、普通 push、push 后远端 target ref 回读与交付后的 retained sync/install/Doctor；`remoteAfterRef` 必须是等于 carrier 的真实回读值。
- `cleanup` 把 delivery identity 交给 Task Environment；不直接删除 provider 状态或写第二份 Environment 结论。

目标分支在 carrier 准备后前进时，产品返回 `task-finish.target-race` 与精确 resume token；恢复只重做隔离 carrier 的 `prepare → verify → deliver → cleanup`，不增加 Candidate generation、不重跑 formal Verification 或 Completion Review。新基线上冲突、贡献漂移、等价性无法证明或需要语义判断时，`failed` 且 `nextWorkflow: task-development`，必须退出 Finish，不修复或恢复 run。其他 `blocked` 只使用产品返回的 `runId` 与 `resume.token` 重试；除产品对 target-race 明确失效的 carrier phases 外，不得手写 token或重做已通过阶段。

恢复命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <canonical-workspace> --json
```

## 禁止事项

Finish 不创建、递增或回退 Candidate generation；只有确定性证明最新 Delivery Baseline 上的 Task Contribution identity 等价时，才复用既有 Candidate、Verification、Completion Review 与 handoff。不修改 Development Receipt；不收敛/同步/归档 Change；不改变 Candidate 内容；不发起 Task Verification 或 Completion Review；不决定 proceed/blocked；不接受用户风险。Git clean apply 或路径不重叠都不等于语义安全，语义判断仍由 Agent、Project 与既有 verification policy 承担。任何一项需要发生都退出到 `task-development`。

## 完成标准

- 五阶段全部 passed/not-applicable；
- Result 明确引用 Development handoff、Task Candidate/generation、Content Target、Task Contribution、Delivery Baseline 和 Delivery Carrier；
- carrier equivalence 为 current，target 仅 fast-forward，Environment cleanup 完成；
- Git-backed delivery 的 configured remote、普通 push 和 after ref 回读均已证明，且 `remoteAfterRef` 等于 carrier ref；
- `agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions = 0`。
