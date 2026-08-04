## Context

当前 Development Content Target observer 以 retained checkout 的最新 HEAD 重新计算 Task Contribution，因此 Delivery Baseline 前进会进入 Candidate applicability。Finish 的 `prepare`/`verify` 又把 `contribution-apply-conflict`、`contribution-not-equivalent` 统一标为 `upstream-candidate-defect`，run result 随后输出 `nextWorkflow: task-development`。Finish 没有直接写 Development Receipt；真正使 gates stale 的动作是 Agent 随后 rebase 或修改原 Task worktree，再调用 Development `observe`。

## Goals / Non-Goals

**Goals:**

- Development 唯一拥有 Candidate applicability；Delivery Baseline 前进本身不参与其 current/stale identity。
- Finish 在最新 Delivery Baseline 上建立隔离 Delivery Carrier，clean apply 确定性复用，conflict 保留 carrier 并返回交付适配（Delivery Adaptation）。
- Agent 只在 run-owned carrier 中处理语义兼容；Buildr 只验证 ownership、baseline、source/handoff current、Git identity、cleanliness、兼容检查事实与 remote transition。
- 同一 run 通过现有 exact resume token 恢复；结果明确区分 `deterministic-reuse` 与 `agent-reviewed-delivery-adaptation`。

**Non-Goals:**

- 不自动解决冲突、rebase/修改原 Task worktree、force push或依据路径不重叠推断语义安全。
- 不新增 Candidate、Verification/Review store、通用状态机、CAS、历史系统、调度器、用户执行计划或额外生命周期页签。
- 不修改已归档 Change 或抹除既有 Candidate generations/Finish runs。

## Decisions

### 1. Development 只观察原 Task source，不观察最新 Delivery Baseline

Git-backed Content Target 回到 task checkout 的精确 deliverable source snapshot identity；`.git`、`.buildr` 等控制内容继续排除。只要原 Task worktree、Task Context、policy 与 gates 未变，retained target ref 前进不会改变 Development read model。Agent 不得为交付适配 rebase 原 Task worktree；真实 source 内容变化仍自然触发 `content-target-changed`。

不保留“Development 与 Finish 共享最新 baseline delta observer”的方案，因为它让 Delivery Baseline 成为第二个 Candidate applicability 输入。Task Contribution 的 Git delta 仍由 Finish 冻结并消费，但不能反向改写 Development Receipt。

### 2. Finish conflict 是可恢复的交付事实，不是 Candidate defect

`prepare` 先在 run-owned detached worktree 冻结最新 Delivery Baseline 与原 Task Contribution。clean apply 形成 carrier commit并标记 `deterministic-reuse`。Git apply conflict或无法机械形成等价 delta时，保留 baseline carrier，输出 `delivery-adaptation-required`/`semantic-review-required`、精确 resume token和确定性诊断；不 push、不 cleanup Task Environment、不写 Development Receipt、不设置 `nextWorkflow: task-development`。

仅 Development Application 报告 handoff/source/context/policy/gate stale时使用 `upstream-candidate-defect` 和 `nextWorkflow: task-development`。

### 3. Delivery Adaptation 只改变隔离 carrier

Agent 可在被 run ownership、path 和 baseline identity 绑定的 carrier 中人工编辑并提交。恢复时 Buildr 不把 resume 动作或调用方 boolean当语义等价证据，只重新核验：

- carrier仍由同一 run拥有，HEAD ancestry包含被冻结 Delivery Baseline，worktree/index clean；
-原 Task source与 Development handoff仍current，冻结 Task Contribution未漂移；
-carrier相对 Delivery Baseline 有真实内容变化，记录 path、mode、blob、tree/head identity；
-Project 既有 policy 要求的有界 carrier compatibility checks 已通过。

适配路径的结果只称 `agent-reviewed-delivery-adaptation`，不称 Buildr 已确定性证明语义等价。compatibility execution是 carrier compatibility evidence，不写 Task Verification Result，`formalVerificationExecutions`固定为0。

### 4. Resume 与 target-race 收敛到同一 carrier authority

沿用现有 blocked run、phase和exact token。`target-race`使 `prepare → verify → deliver → cleanup` outputs 失效并在最新 baseline 重建 carrier；若 clean apply继续 deterministic reuse，若 conflict则进入同一 Delivery Adaptation blocked path。删除“conflict terminal failed → Development rebuild Candidate”的旧分支。

### 5. Fail closed 边界

Task source/handoff真实漂移由 Development rebuild。Carrier ownership、baseline ancestry、source contribution、cleanliness或compatibility checks无法证明时 run保持 blocked；不得 push或cleanup。远端 ref在push前变化继续返回target-race；普通push后必须真实回读carrier ref才允许retained sync/Doctor与cleanup。

## Risks / Trade-offs

- [风险] Agent edits carrier不等于语义正确。→ 结果明确标记Agent-reviewed，执行既有policy要求的bounded compatibility checks，并保留正式Verification复用事实与计数区别。
- [风险] 原 Task worktree被误改。→ 每次resume/verify/deliver都调用Development read model；一旦stale只返回Development rebuild。
- [风险] blocked carrier残留。→ 只保留run-owned carrier；成功后cleanup，ownership不明时保留并fail closed。
- [风险] 旧失败run形状不兼容。→ 不迁移或改写terminal旧run；新行为只用于当前schema下新建run。

## Migration Plan

1. 更新 specs、Skills 与 result wording，先建立 contract baseline。
2. 收敛 Development observer和 Finish failure mapping/resume carrier实现。
3. 用真实 Git remote fixtures验证三条路径及cleanup。
4. 同步 current knowledge/runtime，正式验证并冻结新的任务 Candidate；旧generation与旧failed run只作历史事实保留。

## Open Questions

无。当前实现只消费既有 Project verification policy，不新增独立 compatibility policy或Result store。
