## Why

Task Development 的完整 operation result 适合作为 authority read model，但日常推进时信息过重且 `nextActions` 大多为空，Agent 常需额外 inspect 和自行重建当前阶段。与此同时，`begin|planning` 省略 `planning` 会被静默解释为空 snapshot，OpenSpec 收敛遇到 Scenario 遗漏时又只返回泛化 blocker，都会制造不必要的往返和误判风险。

## What Changes

- 为 Task Development 内部 driver 增加显式、只读的 compact result projection，从同一次 Application result 返回 current identity/applicability 摘要与建议性 next actions；默认完整结果保持不变。
- **BREAKING（无效输入收紧）**：`begin|planning` 必须显式提交完整 `planning` snapshot；省略字段直接失败，不再静默清空既有 planning facts。
- OpenSpec deterministic convergence 在 partial `MODIFIED` 省略既有 Scenario 时，继续整批零写入阻塞，并返回确定排序的 omitted Scenario identities；Buildr 不自动补写或决定删除语义。
- 同步 Task Development Skill、capability contract、测试与当前知识；效率指标继续只供跟踪、评估和优化，不参与 gate、状态或自动推进。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 增加 opt-in compact current/next-action projection，并把 `planning` 整值写入改为显式必填。
- `openspec-deterministic-sync`: semantic blocker 精确返回 omitted Scenario identities，同时保持 deterministic、fail-closed 和零写入边界。

## Impact

- 代码：Task Development internal driver、operation contracts/Application，以及 OpenSpec convergence planner 与兼容性 deterministic planner。
- 资产：`buildr.task-development@2` contract、Task Development Skill、Buildr Service 当前知识。
- 测试：Task Development unit/integration/contract tests 与 OpenSpec deterministic/convergence integration tests。
- 不新增 repository、SQLite 字段或 migration；不改变 Verification、Candidate、Finish、binding、runtime projection 或发布流程。
