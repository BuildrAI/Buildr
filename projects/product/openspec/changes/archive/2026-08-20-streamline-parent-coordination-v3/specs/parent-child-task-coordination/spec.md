## ADDED Requirements

### Requirement: Parent Coordination v3 必须消除重复但保留协调语义
Parent Coordination Application MUST 只在顶层`plan`返回Plan摘要，只在顶层`contributions`返回rich work items，并 MUST继续保留预期、可启动性与真实绑定/交付三个正交轴。Application MUST不返回`parentPlan`、`plan.contributions`、`finalAcceptanceReady`、work item `expectedChild`、Child `plannedContributions`、`startup.dependencyBlockers`或顶层`nextActions`。

#### Scenario: 读取v2 Parent Plan
- **WHEN** stored Parent Plan使用`buildr.parent-plan/v2`
- **THEN** v3 MUST在`plan`返回source schema、identity、outcome、architecture decisions与final acceptance
- **AND** 每个work item MUST只在顶层`contributions`出现一次

#### Scenario: 读取v1 Parent Plan
- **WHEN** stored Parent Plan使用只读兼容v1
- **THEN** v3 MUST保留原source schema与identity并返回rich compatibility work items
- **AND** MUST不自动写回、reconcile或嵌入第二份raw Plan

### Requirement: Parent Coordination v3 必须只嵌入专业摘要
Parent Coordination Application MUST先验证current Planning Review与matching Contribution Handoff，再只返回协调所需摘要；MUST不复制完整Review Result或完整Development handoff正文。

#### Scenario: Planning Review current
- **WHEN** Parent具有current Planning Review
- **THEN** v3 MUST返回present、applicability、result digest、outcome、summary与completed time
- **AND** MUST不返回完整reviewed、uncovered、findings或Result envelope

#### Scenario: Child具有matching handoff
- **WHEN** completed Child具有matching saved Contribution Handoff
- **THEN** v3 MUST返回Child binding、delivery proof与各disposition的稳定协调摘要
- **AND** MUST继续让top-level contribution正确派生delivered、residual或superseded状态
