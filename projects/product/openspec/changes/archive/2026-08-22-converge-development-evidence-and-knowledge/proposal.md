## Why

Buildr 已能分别记录 Content Target、Verification、Completion Review、Task Candidate 与 Handoff，但当前顺序仍由 workflow 固定：Verification 必须发生在 Candidate freeze 之前，Current Knowledge 只作为验证前的即时建议，Verification `record` 也无法证明 capability facts 来自哪个可独立复核的 authority。这会把 Agent 的合法工作顺序误当成完成契约，并允许缺少来源绑定的 claimed facts 进入正式 Result。

## What Changes

- **BREAKING**：Task Candidate 在 stable Content Target 与 current policy 形成后冻结，Formal Verification 与 Completion Review 都绑定该 Candidate；不再要求 Verification 先于 Candidate freeze。
- Development 增加 current knowledge disposition，handoff 只因会造成错误完成结论的冲突而 blocked；解释性漂移和历史知识债务形成 attention，不成为通用研发门禁。
- Task Verification 增加受控 reconciliation：只从 matching、terminal、可独立读取的 verification execution authority 提炼 capability facts，并把 evidence source identity 纳入 current Result。
- 继续允许 command runner、Agent 有界操作和外部系统产生执行事实，但 formal Result 不接受没有精确 target、Candidate、declaration、capability 与 authority 绑定的 claimed success。
- 保持 OpenSpec convergence、current knowledge、Review、Verification 与 Development 各自的专业 authority；不实现 legacy Parent correction 或通用外部系统平台。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 调整 Candidate、Verification、Completion 与 Handoff 的聚合顺序，并纳入 current knowledge disposition。
- `task-verification`: 为 Result 增加 Candidate 与 evidence authority 绑定，以及从可核验 execution authority 进行 reconciliation 的行为。
- `current-knowledge-maintenance`: 区分会造成错误完成结论的阻塞冲突与仅需 attention 的解释性漂移或历史债务。

## Impact

- 影响 Task Development/Verification domain、Application、internal workflow contracts、CLI 与 Workspace source Skills/contracts。
- Task Verification Result 写入升级为新 schema；reader 兼容既有 v1 Result，但 current writer 只写新 schema，不回填历史数据。
- 影响 Development 与 Verification 的集成、契约、system journey 测试，以及 Product OpenSpec/current knowledge。
- 不影响 Buildr Web 前端、legacy Parent closure、Task Finish delivery/activation/cleanup 正交边界，也不新增外部验证 provider registry。
