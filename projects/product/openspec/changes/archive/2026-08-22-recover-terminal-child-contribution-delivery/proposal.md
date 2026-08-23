## Why

当前 Parent Coordination 只接受正式 Finish 已关联的 immutable Development handoff 内原生保存的 Contribution Handoff。若 Child 已真实交付并进入 completed，但历史编排遗漏了 Contribution binding 或 Contribution Handoff，系统会永久停在 unassigned / unproven；现有公开动作又全部要求 active Task，导致 Agent 只能重复开发或手工改库，违背 Buildr “约束错误而不否定可验证事实”的 Core Rule。

## What Changes

- 为已 completed 且具有 matching terminal Finish association 的 Child 增加一次性、append-only Contribution delivery reconciliation。
- 恢复动作必须验证 current Parent Plan、真实 Parent/Child 关系、immutable Development handoff、Candidate/generation、三个 gate 与 terminal Finish association；不得仅凭 Task status、Git commit、文件或调用方声明认领交付。
- 恢复 evidence 独立引用既有 handoff，不修改旧 handoff、Task Record、Finish terminal payload 或历史 Development Receipt。
- Parent Coordination read model 将合法恢复 evidence 与原生 Contribution Handoff 等价用于 boundContributions 和 delivery disposition 派生，并显式标明 evidence source。
- 正常 active Child 的 bind → handoff → Finish 路径保持不变；恢复动作只适用于缺少原生 Contribution Handoff 的终态异常。
- 同步 CLI、Application/Persistence、契约测试、架构文档与 Agent Skill 指引。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- parent-child-task-coordination：增加终态 Child Contribution 交付的严格恢复入口、证据约束和 read model 消费规则。
- task-development：增加不改写 immutable handoff 的 append-only terminal contribution reconciliation 专业事实与 writer 边界。

## Impact

- Product OpenSpec：parent-child-task-coordination、task-development。
- Buildr Service：Task Development / Parent Coordination Domain、Application、Persistence、SQLite migration、CLI 与公开 JSON 投影。
- Agent assets：buildr.task-development/v2 contract、Task Development Skill 与 Buildr 入口指引。
- Tests：domain、application、repository、CLI contract、Parent Coordination integration 和真实历史缺口恢复场景。
