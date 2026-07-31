## Why

真实 Task Finish 收尾证明 action registry 已能自动执行确定性步骤，但 finish run 仍允许调用方自填与真实 Git/verification 状态不一致的 fingerprint，并把 provider claim/complete 间隔误当作验证执行时间。继续扩展自动化前，必须先让 candidate identity、evidence invalidation、diagnostic 生命周期和 completion timing 成为产品可核验事实。

## What Changes

- Task Finish 从结构化 provider evidence 和产品 observation 中提取 candidate、target ref、runtime 与 verification identity，拒绝无法核验或与实际结果不一致的 completion。
- candidate amend、rebase、archive 等内容或交付身份变化后，按 dependency 自动使旧 candidate、target convergence、formal assurance 及下游 evidence stale；completion receipt 只投射当前有效 evidence/effects。
- formal-assurance 接受 selected verification provider 的可信 timing summary，记录真实 verifier execution wall-clock，而不是 claim 到 complete 的人工间隔。
- timing 区分 provider execution、产品命令执行、Agent orchestration gap、blocked recovery、用户暂停与端到端 wall-clock，并保持并行阶段不相加。
- 成功恢复后清除当前 compact diagnostic；历史失败只通过 bounded diagnostic reference 保留，不持续污染后续正常 checkpoint。
- OpenSpec candidate audit 相对目标基线检查完整候选差异，并核验当前候选的 convergence receipt，避免已提交的 canonical 回退被误报为“无变化”。
- OpenSpec convergence 恢复兼容合法旧 v2 receipt：先以旧 receipt/plan 自身一致的 delta、digest 和同步 transition identity 观察 canonical；当前 delta 已变化时，只接受旧 expected 的严格 append-only canonical 扩展并重新规划，缺失、歧义、不匹配、旧内容改写或混合状态继续 fail closed。
- 不改变 required assurance、Git 授权、repair 边界或自动执行覆盖范围；不包含 provider action 连续执行、detached process 和 compact doctor 输出优化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 收紧 finish evidence 的产品可核验 identity、失效投射、provider execution timing 与 resolved diagnostic 契约。

## Impact

- Task Finish run/checkpoint、completion receipt、timing 与 diagnostic application model。
- action registry provider handoff 的 result evidence schema 与 CLI completion 输入。
- Git/verification identity 提取、OpenSpec candidate audit 和相关 unit/integration/verification contracts。
- Task Finish Skill、CLI reference、current knowledge 与长期优化任务看板。
