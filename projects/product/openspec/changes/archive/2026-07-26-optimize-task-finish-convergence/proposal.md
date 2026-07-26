## Why

一次真实的 Buildr 收尾暴露出，`task-finish` 已有的收敛顺序和 OpenSpec 门禁虽然能阻止错误交付，但在 canonical sync 前后仍需要 Agent 手工比对 Requirement。相对 CLI 路径、过早写入 canonical spec、遗漏完整 Requirement 文本都会把一次普通收尾扩展成多轮诊断、回退和重复门禁。现在需要把这些可预防的返工收敛为可执行、可诊断的流程能力。

## What Changes

- 强化 Task Finish 的 OpenSpec 收敛事务：确认 rehearsal、pre-sync receipt、canonical sync、post-sync 和 archive 的唯一顺序，并在任一前置事实失效时给出明确恢复边界。
- 为 OpenSpec contract guard 提供面向 Agent 的 requirement-level 同步差异和可执行 next action，避免通过人工复制或猜测修复 post-sync mismatch。
- 让收尾报告区分必要验证耗时、收敛检查耗时和可避免的失效/重试成本，帮助定位流程而非把总时长笼统归因于测试。
- 规范 archive rehearsal 的 CLI 解析边界，确保隔离 planning copy 能稳定使用调用方已验证的 OpenSpec executable。

无破坏性用户 API 变更；已有 active Change 和 archive 继续按现有兼容路径处理。

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `agent-task-workflows`: 收紧 Task Finish 的 OpenSpec 收敛顺序、失败恢复和成本报告要求。
- `openspec-contract-guard`: 为 post-sync mismatch 增加可操作、requirement 级的实际/预期差异与同步指导。
- `task-verification`: 让收尾消费的验证结果能与收敛/重试成本清晰区分并可汇总报告。

## Impact

- 受影响资产：`task-finish`、`openspec-contract-guard`、`task-verification` Skills 及其 capability contracts，OpenSpec guard/application 实现与相关 contract/integration tests。
- 不改变业务产品 API；会改变 Buildr Agent 的收尾诊断、同步指导和结果证据结构。
