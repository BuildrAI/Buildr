---
name: task-finish
description: 用户要求已有 active formal Task 的“收尾”或交付 current formal Development handoff 时使用；在隔离交付载体（Delivery Carrier）上机械复用或进行交付适配（Delivery Adaptation）、推进 retained target 并清理 Environment，只有 Development applicability stale 才返回 Task Development。
---

# Task Finish

本 Skill 只处理 active formal Task，提供 `buildr.task-finish/v1` 入口；不编排 Development/Review/Verification，不写 Receipt。没有 active Task 时用户说“收尾”，转由直接 Git 路径执行；不得创建临时 Task，也不把 Git Result 冒充 Formal Finish。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace，通过 `task-environment` 确认 matching ready Environment。
2. 通过 `task-development` Application inspect current formal handoff；必须能取得精确 handoff、Candidate/generation、Content Target identities 和 proceed decision。
3. handoff missing/stale、Change 仍未处置、Verification/Completion 不完整或风险未获接受时停止，返回 Task Development；Finish 不补齐这些事实。
   - Child承担Parent Contribution时，handoff还必须包含与current Parent Plan和planned binding一致的Contribution Handoff。
   - Parent采用Parent Plan时，必须已记录current plan identity的显式最终集成验收；Child全部完成本身不满足该条件。
4. 用户排除push、install或cleanup而改变交付语义时停止。
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

五阶段由产品连续执行，Agent不编排阶段、补evidence或设计recovery。

- `preflight` 只核对 current handoff、Environment、carrier adapter 与 retained target；activation不读取Project或Service声明。
- `prepare`在隔离交付载体（Delivery Carrier）把任务贡献（Task Contribution）机械应用到最新交付基线（Delivery Baseline）。clean apply记录`deterministic-reuse`；Git conflict保留carrier并返回`delivery-adaptation-required`，不改原Task worktree。
- Agent只在carrier完成交付适配（Delivery Adaptation）；resume核验ownership、baseline、source/handoff、cleanliness与bounded compatibility checks。checks不写Task Verification Result，`formalVerificationExecutions` 必须为 `0`。
- `verify` 对clean apply记录确定性Git identity；对适配记录`agent-reviewed-delivery-adaptation`，不得描述为Buildr已证明语义等价。Candidate identity/generation保持不变。
- `deliver`只做fast-forward、普通push/回读、类型化runtime activation与通用Workspace inventory Doctor。Task Contribution命中Workspace根runtime source时render，其他为none；Doctor仍要求Workspace health ready，但不选择Agent adapter把待post-Finish专属激活的Product runtime drift升级为Finish失败；不读取Project/Service配置，不执行sync，不安装Buildr development CLI或Local App，也不接受任意命令字符串。
- render不得产生tracked/staged delta。普通交付的`remoteAfterRef`与`finalRemoteRef`都等于carrier；仅当最新target可证明完整包含carrier时，记录`targetDisposition: already-contained`、原carrier ref与最新后代final remote ref。
- `cleanup` 把 delivery identity 交给 Task Environment；不直接删除 provider 状态或写第二份 Environment 结论。

target前进时先证明carrier ancestry及changed paths；完整包含则跳过apply/fast-forward/push并继续Doctor与cleanup，否则返回精确token。恢复不增加 Candidate generation、不重跑formal Verification或Completion Review。Git conflict返回适配facts；原Task source/handoff真实stale时才返回`nextWorkflow: task-development`。不得手写token、recovery manifest或claimed semantic equivalence。

恢复命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <product-token> --target <canonical-workspace> --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <canonical-workspace> --json
```

## 禁止事项

Finish不改变Candidate/generation、Development Receipt、Change或原Task worktree，不发起 Task Verification/Completion Review，也不决定proceed/blocked或接受风险。Finish不运行OpenSpec Converge或Convergence Inspect，不要求Convergence Receipt进入Delivery Carrier，也不在Environment cleanup后追索该事务材料。两种reuse mode都复用handoff；clean apply、resume或路径不重叠都不等于语义安全。

## 完成标准

- 五阶段全部 passed/not-applicable；
- Result引用Development handoff、Candidate/generation、Content Target、Task Contribution、Delivery Baseline和Delivery Carrier；
- Result标记`deterministic-reuse`或`agent-reviewed-delivery-adaptation`，后者不声称Buildr证明语义等价；
- carrier equivalence 为 current，target 仅 fast-forward，Environment cleanup 完成；
- Git delivery完成remote回读；普通路径after/final ref等于carrier，`already-contained`保留逐路径证明、原carrier与最新后代final ref；
- `agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions = 0`。

complete 后先报告终态，再询问是否进行“任务复盘”：当前关注 Agent 耗时、Token、重复尝试和人机协作，Token 不可得可缺失。仅用户同意后路由 `task-retrospective`；blocked/failed 不提示，且复盘不影响终态。
