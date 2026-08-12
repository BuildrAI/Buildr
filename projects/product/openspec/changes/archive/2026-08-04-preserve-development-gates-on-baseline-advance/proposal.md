## Why

现有 Task Finish 已能在最新交付基线（Delivery Baseline）上证明任务贡献（Task Contribution）等价并复用候选（Candidate），但 Task Development 仍以整个 checkout 的内容 identity 判断 Content Target。仅引入基线前进的 rebase 会因此错误地使 Candidate、正式验证（Verification）、完成审查（Completion Review）和研发交接（Development Handoff）失效，迫使任务重复生成 Candidate 与验证。

## What Changes

- Task Development 在 Git-backed Environment 中区分任务贡献与交付基线；只由基线前进造成、且贡献可确定性证明未变的 checkout 变化不使既有 Content Target 或 gates 失效。
- 贡献变化、Git 冲突、identity 无法证明或需要语义判断时继续 fail closed，并返回 Task Development 正常重建稳定目标。
- 保持现有单一 Development Receipt、Candidate generation 和 handoff authority，不新增状态机、历史存储、CAS 或第二套 Candidate。
- 增加真实 Development → rebase → gate inspect → Finish 流程测试，避免使用固定 `handoff: current` stub 掩盖适用性问题。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 修正 Git-backed Task Development 对纯 Delivery Baseline 前进的适用性判断与 fail-closed 边界。

## Impact

- Task Development 的 Content Target 观察和 current gate 推导。
- Git-backed Task Contribution identity 的复用边界。
- Task Development / Task Finish 集成与系统测试。
- 对应 Task Development Skill、capability contract、产品文档和 current knowledge 表述。
