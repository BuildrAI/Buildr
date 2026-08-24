## ADDED Requirements

### Requirement: Parent Plan v2 必须结构化表达完整实施方向
Buildr MUST 让新 Parent Plan writer 只写 `buildr.parent-plan/v2`，并在每个 work item 中保存稳定 `id`、`priority`、`title`、`objective`、`directions[]`、`boundaries[]`、可空 `expectedChild` 与 `dependencies[]`；Plan 还 MUST 保存 `outcome`、`architectureDecisions[]` 与 `finalAcceptance[]`，并让全部结构化内容进入 Plan identity。

#### Scenario: v2 完整 round-trip
- **WHEN** caller 提交包含多项方向、边界、预计 Child、依赖、跨 Child 决策和最终验收的合法 v2 input
- **THEN** Domain 与 Application MUST 无损保存和读取全部字段
- **AND** identity MUST 由规范化后的完整 v2 内容派生

#### Scenario: dependency 非法
- **WHEN** work item 引用不存在的依赖、自依赖或形成 dependency cycle
- **THEN** writer MUST 在持久化前返回精确 blocked diagnostic
- **AND** MUST 保持 Development Receipt 零写入

### Requirement: Parent Plan v1 必须 dual-read 且只显式升级
Buildr MUST 继续按原始 v1 payload 与 identity 读取 `buildr.parent-plan/v1`，MUST 通过 compatibility projection 提供 v2 等价 read model，并 MUST 只通过 current expected identity 保护的显式 `reconcile` 把 v1 升级为完整 v2；系统 MUST NOT 在读取、启动、Web 展示或 SQLite migration 中自动 backfill 或写回。

#### Scenario: 读取 v1 Parent Plan
- **WHEN** Development Receipt 保存合法 v1 Parent Plan
- **THEN** inspect MUST 保持原 v1 schema/identity 可验证并返回 rich compatibility projection
- **AND** v1 `summary`、顶层 dependencies 与 `plannedChildTaskId` MUST 分别投影为可读 work item、work-item dependencies 与 legacy expected Child

#### Scenario: 显式升级 v1
- **WHEN** caller 以 current v1 identity 和完整 v2 input 执行 `reconcile`
- **THEN** Application MUST 保存新的 v2 Plan 与新 identity
- **AND** MUST 不修改 Task Parent/Child 关系、Contribution binding、handoff 或 live Task 之外的任何记录

### Requirement: Expected Child 与 Actual Child binding 必须正交
`expectedChild` MUST 只表达预计实施单元名称或目的，MUST NOT 改变 Contribution disposition、eligible calculation、startup readiness 或真实 Child ownership。Actual binding MUST 只由直接 Child Task 的 Parent 关系与 current Child Development Contribution binding 共同派生，delivery disposition MUST 继续只由 matching saved Contribution Handoff 证明。

#### Scenario: 只有 expected Child
- **WHEN** work item 保存 `expectedChild` 但没有满足关系与 Development binding 的真实 Child
- **THEN** read model MUST 返回 `expectation.status=expected` 与 `actual.status=unassigned`
- **AND** 依赖满足时 `eligibility.status` MUST 为 `eligible`

#### Scenario: 建立真实 binding
- **WHEN** 真实 Child Task 具有正确 Parent 关系且 current Development 绑定该 Contribution
- **THEN** read model MUST 返回 actual Child identity/title/Task status 与 `bound|active` actual status
- **AND** MUST NOT 依赖 Parent Plan 中的预计字段建立该状态

### Requirement: Parent work item read model 必须分离三类状态
Parent Coordination Application MUST 为每个 work item 分别返回计划预期、可启动性与真实绑定/交付处置；closed 状态 MUST 至少覆盖 `expected|none`、`eligible|waiting-dependency|not-eligible` 与 `unassigned|bound|active|delivered|residual|superseded|unproven`。Dependency blocker MUST 同时返回稳定 ID 与当前 Plan 中的人类可读标题。

#### Scenario: expected 且 eligible
- **WHEN** 未绑定 work item 具有 expected Child 且全部依赖已 delivered 或 superseded
- **THEN** 同一 read model MUST 同时表达 expected 和 eligible
- **AND** MUST NOT 通过单枚举丢失任一事实

#### Scenario: 等待依赖
- **WHEN** 未绑定 work item 仍依赖未交付 work item
- **THEN** eligibility MUST 为 `waiting-dependency`
- **AND** blockers MUST 返回依赖 work item 的 title 与 id，而不只返回内部 ID

