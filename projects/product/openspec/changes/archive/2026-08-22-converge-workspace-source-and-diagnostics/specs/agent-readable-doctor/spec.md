## MODIFIED Requirements

### Requirement: doctor 分离兼容成功状态与 readiness
Buildr doctor MUST保留`ok`的既有无error语义，并独立报告workspace validity、兼容readiness、action requirement与domain health；每个finding MUST声明domain、scope、affected actions和ownership unit。聚合`health.ready`只表示本次Doctor profile没有actionable finding，MUST NOT被任何consumer解释为通用工作许可。

#### Scenario: Selected runtime 存在 actionable warning
- **WHEN** doctor 显式选择 runtime，且该 runtime 没有 error 但存在至少一个需要用户行动的 warning
- **THEN** `ok` MUST 为 true
- **AND** `health.workspaceValid` MUST 反映 canonical workspace identity
- **AND** `health.ready` MUST 为 false
- **AND** Runtime domain health MUST只列出受影响adapter actions
- **AND** `health.actionRequired` MUST 为 true

#### Scenario: workspace 可直接继续工作
- **WHEN** canonical workspace identity有效且当前profile不存在需要用户行动的warning或error
- **THEN** `health.workspaceValid` MUST为true
- **AND** `health.ready` MUST为true
- **AND** `health.generalWorkPermitted` MUST为null
- **AND** `health.actionRequired` MUST为false

#### Scenario: 非行动信息不降低 readiness
- **WHEN** finding 明确设置 `userActionRequired: false`
- **THEN** 该 finding MUST NOT 计入 `health.actionableCount`
- **AND** 该 finding MUST NOT 单独使 `health.ready` 变为 false

#### Scenario: finding提供局部消费事实
- **WHEN** Doctor生成warning或error finding
- **THEN** finding MUST包含稳定domain、scope、affectedActions与ownershipUnit
- **AND** domain health MUST按这些字段投影status、actionableCount与blockedActions

#### Scenario: 聚合全部非行动型 runtime warnings
- **WHEN** 某个 scope/adapter 的全部 runtime warnings 都明确设置 `userActionRequired: false`
- **THEN** 顶层 runtime warning MUST 保留 warning severity 和来源诊断摘要
- **AND** 顶层 runtime warning MUST 设置 `userActionRequired: false`
- **AND** `health.ready` MUST NOT 因该聚合 warning 变为 false
- **AND** `repairPlan` 和 `nextSteps` MUST NOT 为该聚合 warning 生成修复动作

#### Scenario: Selected runtime 聚合混合 warnings
- **WHEN** selected runtime 的某个 scope 同时包含行动型与非行动型 runtime warnings
- **THEN** 顶层 runtime warning MUST 设置 `userActionRequired: true`
- **AND** 顶层 finding MUST 保留全部来源 warning codes
- **AND** 只对应Runtime domain与相关actions MUST报告blocked

#### Scenario: 未选中 runtime 聚合混合 warnings
- **WHEN** 默认 inventory diagnostics 在未选中 runtime 中发现行动型与非行动型 runtime warnings
- **THEN** 顶层 inventory warning MUST 设置 `userActionRequired: false`
- **AND** MUST NOT 进入 `repairPlan` 或 `nextSteps`
- **AND** 无关domain/action MUST NOT因该runtime blocked
