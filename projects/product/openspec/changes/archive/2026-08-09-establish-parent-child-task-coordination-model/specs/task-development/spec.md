## ADDED Requirements

### Requirement: Development Receipt 必须承载可选 Parent Plan
Task Development MUST在按Task唯一的现有SQLite current Receipt中保存可选closed Parent Plan和planned Contribution bindings，使用新Receipt major并将旧major读取为absent-compatible；MUST NOT新增Parent Plan表或backfill历史rows。

#### Scenario: v2 与 v3 Receipt 共存
- **WHEN** Workspace同时包含没有Parent Plan的旧Receipt和采用Parent Plan的新Receipt
- **THEN** Application MUST正常读取两者
- **AND** 只有显式Parent Plan mutation MUST写入新模型

### Requirement: Development Handoff 必须承载实际 Contribution 事实
Task Development MUST在现有append-only immutable handoff中保存可选Contribution Handoff，并将其纳入handoff identity与Finish terminal association；MUST NOT创建第二Result或delivery registry。

#### Scenario: handoff 记录 extra 和 superseded
- **WHEN** Child实际交付跨越原planned范围
- **THEN** handoff MUST分别保存extra、affected与superseded Contribution事实及唯一next action
- **AND** 后续current变化 MUST NOT改写既有snapshot
