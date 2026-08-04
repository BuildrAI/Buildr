## Why

当前 Task Development 只有在 Planning Review ready 后、观察稳定 Content Target 时才形成 Development Receipt，导致提案、方案、方案审查以及用户主动跳过节点等正式研发事实在进入实现前没有统一的 current authority。Task Development 应覆盖从首个正式研发动作到 Finish handoff 的完整研发区间，同时继续让 OpenSpec、Task Review、Task Verification 与 Task Finish 分别拥有专业内容和执行事实。

## What Changes

- 允许 Task Development 在 active Task 的首个正式研发动作时建立 Development Receipt，不再以 Planning Review ready 或 Content Target 已稳定作为 Receipt 存在的前提。
- 为研发过程增加最小、可移植的节点事实：记录节点是否存在、current、pending、stale、not-applicable 或由用户明确 waived，并引用专业 authority 的逻辑目标与 identity，不复制 proposal、design 或 Result 正文。
- 让 proposal、design、Planning Review、实现收敛、formal Verification、Completion Review 等节点保持可选；Candidate freeze 与 Finish handoff 仍根据当前 policy 判断哪些事实必须满足或已获得明确豁免。
- 扩展 Development inspect 与 Local App“研发”视图，使其在 Content Target 形成前也能展示当前研发事实、缺口、豁免和下一动作。
- 保持 OpenSpec、Task Review、Task Verification 与 Task Finish 的独立 writer 边界；Task Development 只拥有研发聚合事实、适用性、推进决定、Candidate 与 handoff。
- **BREAKING**：升级 Task Development capability contract 与 Development Receipt schema；产品必须确定性读取并迁移现有 v1 Receipt，受影响 consumer 同步切换到新版 contract。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 把 Task Development 的 authority 区间从 Planning Review 后扩展为首个正式研发动作至 Finish handoff，并定义可选节点、豁免、currentness、Receipt 迁移和既有专业 authority 边界。
- `agent-task-workflows`: 升级 Development provider/consumer binding，并让 Task Triage 与 OpenSpec planning 入口在首个正式研发动作登记 Development facts。

## Impact

- Product specs：`openspec/specs/task-development/spec.md`、`openspec/specs/agent-task-workflows/spec.md`。
- Task Development domain、Application、filesystem repository、internal driver 与 read model。
- Development Receipt schema、capability contract、Skill routing、Task Triage/Task Finish consumer binding。
- Local App Task Development 只读投影及其 API/Web 测试。
- Task Development unit、integration、system、contract 与 package/runtime projection 验证。
