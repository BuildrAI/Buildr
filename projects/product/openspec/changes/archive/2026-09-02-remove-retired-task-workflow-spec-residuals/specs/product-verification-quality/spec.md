## ADDED Requirements

### Requirement: 专属 Integration slice 必须保持当前能力的唯一 primary ownership
Verification registry MUST为仍存在的Task Entry、Overview、Review、Verification、Retrospective、Environment与Parent Coordination实现选择唯一primary owner，不得保留退役能力的空step或shard。

#### Scenario: changed paths命中Task read或专业实现
- **WHEN** affected selection命中当前Task实现
- **THEN** MUST选择覆盖该实现的现有owner
- **AND** MUST不选择Task Development、Planning Identity或旧Finish owner

## REMOVED Requirements

### Requirement: 专属 Integration slice 必须保持唯一 primary ownership
**Reason**: changed-path场景仍列出Planning Identity。
**Migration**: 由当前能力owner Requirement替代。
