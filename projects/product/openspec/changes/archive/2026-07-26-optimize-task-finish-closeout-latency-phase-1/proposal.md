## Why

当前 Task Finish 已具备持久化、可恢复和并发 fencing 架构，但正常收尾仍会因 OpenSpec 顺序返工、逐个暴露 delta 问题、固定长 lease、错误命令上下文、验证遗留进程以及 late asset signal 丢失而显著超出预期。第一阶段需要在不引入完整自动 executor 的前提下消除这些可避免成本，把正常收尾稳定收敛到 5–7 分钟级目标。

## What Changes

- 提供受控的 OpenSpec convergence helper，固定执行 archive rehearsal、pre-sync、canonical sync 和 post-sync 顺序，并禁止从 post-sync 状态倒推或重建 pre-sync baseline。
- 让 archive rehearsal 聚合报告全部可检测的 requirement/scenario 不兼容问题，避免一次修复一个问题的重复预演。
- 将共享资源 lease 限制到真实临界区并支持同一 attempt 的显式续租，避免长动作因固定 TTL 过期而无效返工。
- 为 Task Finish 提供命令执行计划的明确 cwd、可执行入口和参数证据，提前拒绝不存在的脚本、错误工作目录和无效 selector。
- 在验证 consumer 完成后回收能够证明属于当前 task environment 的遗留进程，并保留其他任务和用户进程。
- 记录完整 finish attempt 的阶段 wall-clock、阻塞、重试与可归因浪费耗时。
- 在 archive、integration 或 cleanup 暴露新长期信号时允许 asset-review provider 执行 late finalize/reopen，避免只在 archive 前 finalize 导致信号遗漏。
- 不建设完整自动 executor，不引入强制新 session，也不把正常收尾机械升级为 Candidate；约 3 分钟和更激进并行化留给后续 Change。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-finish-execution`: 增加安全 convergence、lease 续租/临界区、执行计划、完整计时和 late asset review 的持久化执行要求。
- `agent-task-workflows`: 调整 Task Finish 的 OpenSpec、进程清理、asset review 和阶段耗时工作流承诺。

## Impact

- 影响 Task Finish run/application、CLI JSON contract、OpenSpec archive rehearsal helper、验证进程清理和相关 unit/contract/integration tests。
- 影响随包交付的 `task-finish` Skill、capability contract/contribution 及 Product canonical OpenSpec requirements。
- 不改变外部 OpenSpec Skill 源，不改变 Agent runtime discovery/loading 机制，不要求新 session activation evidence。
