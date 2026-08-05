---
name: task-finish
description: 用户要求“收尾”或交付已有 current formal Development handoff 时使用；在隔离交付载体（Delivery Carrier）上机械复用或进行交付适配（Delivery Adaptation）、推进 retained target 并清理 Environment，只有 Development applicability stale 才返回 Task Development。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的窄入口。它不编排 Development、Review 或 Verification，也不手写 Receipt。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace，通过 `task-environment` 确认 matching ready Environment。
2. 通过 `task-development` Application inspect current formal handoff；必须能取得精确 handoff、Candidate/generation、Content Target identities 和 proceed decision。
3. handoff missing/stale、Change 仍未处置、Verification/Completion 不完整或风险未获接受时停止，返回 Task Development；Finish 不补齐这些事实。
4. handoff必须已闭合资产决定；Finish不读取或finalize asset observation。用户排除push、install或cleanup而改变交付语义时停止。
5. Git-backed run使用retained checkout当前符号分支；显式`--target-branch`必须一致，Environment `startPoint`不提供交付authority。remote按显式值、Environment、branch upstream、唯一配置依次解析；缺失或歧义时停止。

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

- `preflight` 只核对 current handoff、Environment、carrier adapter 与 retained target；activation不读取Project或Service声明。
- `prepare`在隔离交付载体（Delivery Carrier）把任务贡献（Task Contribution）机械应用到最新交付基线（Delivery Baseline）。clean apply记录`deterministic-reuse`；Git conflict保留carrier并返回`delivery-adaptation-required`，不改原Task worktree。
- Agent只在carrier完成交付适配（Delivery Adaptation）；resume核验ownership、baseline、source/handoff、cleanliness与bounded compatibility checks。checks不写Task Verification Result，`formalVerificationExecutions` 必须为 `0`。
- `verify` 对clean apply记录确定性Git identity；对适配记录`agent-reviewed-delivery-adaptation`，不得描述为Buildr已证明语义等价。Candidate identity/generation保持不变。
- `deliver`只做fast-forward、普通push/回读、类型化activation、适用install与Doctor。Task Contribution命中Workspace根runtime source时render，其他为none；不读取Project/Service配置，不执行sync，也不接受任意命令字符串。
- render不得产生tracked/staged delta。`remoteAfterRef`与`finalRemoteRef`都等于carrier远端回读。
- `cleanup` 把 delivery identity 交给 Task Environment；不直接删除 provider 状态或写第二份 Environment 结论。

target前进时返回`task-finish.target-race`与精确token，恢复carrier phases，不增加 Candidate generation、不重跑formal Verification或Completion Review。Git conflict返回Delivery Adaptation facts；原Task source/handoff真实stale时才返回`nextWorkflow: task-development`。不得手写token、recovery manifest或claimed semantic equivalence。

恢复命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <canonical-workspace> --json
```

## 禁止事项

Finish不创建或改变Candidate/generation，不修改Development Receipt，不收敛Change，不改变原Candidate/Task worktree，不发起 Task Verification或Completion Review，不决定proceed/blocked或接受风险。两种reuse mode都复用既有handoff；clean apply、resume或路径不重叠都不等于语义安全。

## 完成标准

- 五阶段全部 passed/not-applicable；
- Result引用Development handoff、Candidate/generation、Content Target、Task Contribution、Delivery Baseline和Delivery Carrier；
- Result标记`deterministic-reuse`或`agent-reviewed-delivery-adaptation`，后者不声称Buildr证明语义等价；
- carrier equivalence 为 current，target 仅 fast-forward，Environment cleanup 完成；
- Git-backed delivery 的 configured remote、普通 push 和 after ref 回读均已证明，且 `remoteAfterRef` 与 `finalRemoteRef` 都等于 carrier ref；
- `agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions = 0`。
