## ADDED Requirements

### Requirement: Parent startup snapshot 必须忽略预计 Child 字段
Task Entry Snapshot MUST 复用 Parent Coordination Application 的 actual binding 与 eligibility 事实，MUST NOT 因 v2 `expectedChild` 或 v1 `plannedChildTaskId` 排除未绑定 work item、伪造 Child 或改变 `start-child-contribution` next。

#### Scenario: 预计 Child 尚未创建
- **WHEN** current ready Parent Plan/Review 中唯一依赖满足的 work item 只有 expected Child 文本而没有 actual binding
- **THEN** snapshot MUST 返回该 work item 为 eligible Contribution
- **AND** next action MUST 仍为 `start-child-contribution`

