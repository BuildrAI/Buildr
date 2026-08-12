## Why

上一 Change 把最新交付基线（Delivery Baseline）带入 Task Development 的任务贡献（Task Contribution）观察，并让 Task Finish 把 Git 应用冲突直接归为候选缺陷。这会形成两套候选（Candidate）适用性 authority：同路径目标前进即使未改动原 Task source，也会被 Finish 推回 Development，Agent 随后 rebase 原 Task worktree 又真实使 gates stale。

## What Changes

- Task Development 成为判断 Content Target、Candidate、正式验证（Verification）、完成审查（Completion Review）与研发交接（Development Handoff）是否 current/stale 的唯一 authority；只读 inspect 只观察原 Task source、Task Context、policy 与 gates。
- Task Finish 只判断最新 Delivery Baseline 上能否形成并确定性核验 run-owned 交付载体（Delivery Carrier）；clean apply 使用 `deterministic-reuse`，Git conflict 返回可恢复的 `delivery-adaptation-required`，不宣称 Candidate stale。
- Agent 只在隔离 Delivery Carrier 中完成交付适配（Delivery Adaptation）；Buildr 记录 ownership、baseline、source Candidate、贡献、carrier tree/head、changed paths、mode/blob identity、cleanliness、compatibility checks 与 remote ref，不伪造语义等价。
- 真实 Task source/Task Contribution、Task Context、policy 或 gate 漂移才由 Development 触发 rebuild；无法判断、ownership/baseline 漂移或 compatibility checks 失败时 fail closed。
- 删除或收敛 `contribution-apply-conflict|contribution-not-equivalent → upstream-candidate-defect → task-development` 和旧 target-race 重建 Candidate 的重复路径，保持 `preflight → prepare → verify → deliver → cleanup`。

本 Change 不包含破坏性 CLI action；不新增通用状态机、历史存储、CAS、Verification store、第二 Candidate authority 或生命周期页签。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 明确 Task Development 是 Candidate applicability 的唯一 authority，以及 Development inspect 与 Delivery Adaptation 的衔接。
- `task-finish-execution`: 将 Finish 冲突从 Candidate defect 收敛为隔离 carrier 的可恢复交付适配，并区分 deterministic reuse 与 Agent-reviewed adaptation。
- `cli-product-surface`: 让 Finish 结果为交付适配返回明确事实与唯一恢复动作，而不是无条件 `nextWorkflow: task-development`。

## Impact

- Task Development Content Target 观察与 current/stale 推导。
- Task Finish run、Git Task Contribution/Delivery Carrier、resume、结果分类、远端交付和 cleanup。
- Task Development、Task Finish Skills、capability contracts、current knowledge 与术语表述。
- contract、integration、system 与真实 remote journey tests。
