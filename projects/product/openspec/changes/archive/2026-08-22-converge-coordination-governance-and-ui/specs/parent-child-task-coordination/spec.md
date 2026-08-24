## ADDED Requirements

### Requirement: 正式 Child 必须代表独立交付的 Contribution
Buildr 与配套 Agent workflow MUST 只在工作单元具有独立目标、明确 scope、可单独形成 Candidate/evidence、immutable Contribution Handoff 与真实 Delivery 时建立正式 Child 并绑定 Parent Contribution。普通并行调查、临时 Agent 分工、同一交付内的局部实现或测试协作 MUST NOT 被强制建模为正式 Child、Contribution 或 Parent 进度事实。

#### Scenario: 同一 Contribution 内并行协作
- **WHEN** Agent 为同一交付目标并行安排代码检索、实现和局部测试，且这些工作不形成独立 Handoff 与 Delivery
- **THEN** workflow MUST 允许在同一正式 Task 内完成协作
- **AND** MUST NOT 仅因存在多个 Agent 或并行动作而创建 Child Task

#### Scenario: 工作单元可以独立交付
- **WHEN** 一项工作具有独立目标、scope、evidence、Handoff 与 Delivery，并需要由 Parent 追踪依赖或 residual
- **THEN** Agent MUST 建立窄 Child 并绑定唯一或明确合并的 Parent Contribution
- **AND** 该 Child MUST 按自己的 Task lifecycle 完成交付
