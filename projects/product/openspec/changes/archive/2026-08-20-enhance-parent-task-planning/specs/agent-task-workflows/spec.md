## ADDED Requirements

### Requirement: Agent workflow 必须使用 Parent Plan v2 并分离预计与真实 Child
Buildr 随包 Task workflow Skills MUST 引导 Agent 让新 Parent 只写 v2；读取 v1 时 MUST 先 inspect 并通过 expected identity 保护的完整 reconcile 显式升级。workflow MUST 把 `expectedChild` 当作说明文本，并 MUST 只在真实 Child Task、Parent relationship 与 Child Development ready 后调用 `bind-child`。

#### Scenario: 规划预计 Child
- **WHEN** Agent 在 Parent Plan 中描述未来实施单元但尚未启动 Child
- **THEN** workflow MUST 写 `expectedChild` 并保留 work item unassigned/eligible 计算
- **AND** MUST 不提前创建 Child、Environment 或 Development binding

#### Scenario: 升级历史 Parent
- **WHEN** 用户明确要求历史 v1 Parent 采用新结构
- **THEN** workflow MUST 使用 inspect current identity、完整 v2 临时 input、reconcile、重新 Planning Review 与 refresh-planning
- **AND** MUST 不直接修改 SQLite 或批量迁移其他 Parent

