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
- `prepare` 在产品拥有的隔离交付载体（Delivery Carrier）中读取最新交付基线（Delivery Baseline），把原任务基线到current source snapshot的任务贡献（Task Contribution）机械应用。clean apply记录`deterministic-reuse`；Git conflict保留run-owned baseline carrier并返回`delivery-adaptation-required`，不得改写原Task worktree/index/branch。
- Agent只在该carrier中完成交付适配（Delivery Adaptation）和语义判断；Buildr resume重新核验ownership、baseline、source/handoff current、cleanliness与Project既有policy要求的bounded compatibility checks。checks不写Task Verification Result，`formalVerificationExecutions` 必须为 `0`。
- `verify` 对clean apply记录确定性Git identity；对适配记录`agent-reviewed-delivery-adaptation`，不得描述为Buildr已证明语义等价。Candidate identity/generation保持不变。
- `deliver` 只做 fast-forward target transition、普通 push、push 后远端 target ref 回读与交付后的 retained sync/install/Doctor；`remoteAfterRef` 必须是等于 carrier 的真实回读值。
- `cleanup` 把 delivery identity 交给 Task Environment；不直接删除 provider 状态或写第二份 Environment 结论。

目标分支在carrier准备后前进时，产品返回`task-finish.target-race`与精确resume token；恢复只重做隔离carrier的`prepare → verify → deliver → cleanup`，不增加 Candidate generation、不重跑formal Verification或Completion Review。新基线上Git conflict或需要语义判断时blocked返回Delivery Adaptation facts，不归类为Candidate defect；Agent适配后只用产品`runId`与`resume.token`恢复。原Task source/handoff真实stale时才返回`nextWorkflow: task-development`。不得手写token、recovery manifest或claimed semantic equivalence。

恢复命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <canonical-workspace> --json
```

## 禁止事项

Finish不创建、递增或回退Candidate generation，也不决定Candidate applicability。`deterministic-reuse`与`agent-reviewed-delivery-adaptation`都复用既有Candidate、Verification、Completion Review与handoff；后者只记录Agent review和确定性carrier/check facts，不伪造Buildr语义等价证明。不修改Development Receipt；不收敛/同步/归档Change；不改变原Candidate或Task worktree；不发起 Task Verification或Completion Review；不决定proceed/blocked；不接受用户风险。Git clean apply或resume动作不等于语义安全，路径不重叠都不等于语义安全。

## 完成标准

- 五阶段全部 passed/not-applicable；
- Result 明确引用 Development handoff、Task Candidate/generation、Content Target、Task Contribution、Delivery Baseline 和 Delivery Carrier；
- Result明确标记`deterministic-reuse`或`agent-reviewed-delivery-adaptation`，后者包含carrier compatibility evidence且不声称Buildr证明语义等价；
- carrier equivalence 为 current，target 仅 fast-forward，Environment cleanup 完成；
- Git-backed delivery 的 configured remote、普通 push 和 after ref 回读均已证明，且 `remoteAfterRef` 等于 carrier ref；
- `agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions = 0`。
