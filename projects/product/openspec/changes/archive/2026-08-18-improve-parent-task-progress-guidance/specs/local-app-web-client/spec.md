## MODIFIED Requirements

### Requirement: Task 详情必须展示协调计划与派生 Child 交付
Buildr Web MUST 在 Task 详情展示 Parent Coordination Application 派生的当前推进状态、推荐下一步、可启动 Contribution、真实启动阻塞、最终验收进度、Parent Plan 治理事实、Child identity/status、planned/delivered/extra/residual/superseded facts 与 final acceptance prerequisites；历史 Task MUST 显示不采用新模型的清晰空态。可启动 Contribution MUST 以 Parent Plan 已保存的 `summary` 作为用户可读名称或计划结果，并同时展示稳定 `id`；Web MUST NOT 维护已知 Contribution 的平行名称字典。页面 MUST 将 `startup` readiness 与 `prerequisitesSatisfied` final acceptance readiness 分开表达，并 MUST 按公开 Planning Review read model 形状展示 outcome、applicability、摘要与时间，不得向用户显示 `undefined`。

#### Scenario: Parent 当前可推进
- **WHEN** read model 返回 `startup.status=ready`、推荐 next action 和一个或多个 eligible Contribution
- **THEN** UI MUST 优先展示“当前可推进”、推荐下一步及推荐 Contribution
- **AND** 每个可启动 Contribution MUST 同时显示其 `summary` 与 `id`
- **AND** 其他 eligible Contribution MUST 与推荐项明确区分

#### Scenario: Parent 当前被治理条件阻塞
- **WHEN** read model 返回 `startup.status=blocked` 和 startup blockers
- **THEN** UI MUST 把这些 blocker 展示为当前推进阻塞
- **AND** MUST NOT 把尚未交付的全部 Contribution 数量冒充为当前启动阻塞

#### Scenario: Contribution 等待依赖但仍有其他可启动项
- **WHEN** read model 同时返回 eligible Contribution 和 response-only dependency blockers
- **THEN** UI MUST 允许用户识别可立即启动项与等待依赖项
- **AND** MUST NOT 在浏览器重算 dependency readiness

#### Scenario: Child completed 但交付未证明
- **WHEN** read model 返回 completed Child 和 unproven Contribution
- **THEN** UI MUST 分别显示 Task 已完成与 Contribution 未证明
- **AND** MUST NOT 用完成图标暗示全部 planned 范围已交付

#### Scenario: 最终验收条件尚未满足
- **WHEN** `prerequisitesSatisfied=false` 但 `startup.status=ready`
- **THEN** UI MUST 显示 Parent 当前仍可启动 eligible Contribution
- **AND** MUST 将未完成项表达为最终验收进度而非“前置条件未满足”

#### Scenario: Planning Review 已存在
- **WHEN** read model 返回 Planning Review result 与 applicability
- **THEN** UI MUST 展示 conclusion outcome、applicability、摘要与 result completedAt
- **AND** 任一可选字段缺失时 MUST 使用明确空态而不是显示 `undefined`

#### Scenario: 历史 Task 没有 Parent Plan
- **WHEN** Parent Coordination read model 返回 legacy mode 或 `parent_plan_absent`
- **THEN** UI MUST 显示该 Task 尚未显式采用 Parent Plan 的清晰空态
- **AND** MUST NOT 自动 backfill、创建或改写任何 Task 或 Plan
