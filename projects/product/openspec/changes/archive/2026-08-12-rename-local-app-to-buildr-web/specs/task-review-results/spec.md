## ADDED Requirements

### Requirement: Task Review Application 必须是 Buildr Web 与专业 consumer 的唯一 Result writer
Buildr MUST 由一个共享 Task Review Application 实现 `inspect` 与 `record`，并 MUST 让 CLI、Skill 与 Buildr Web 复用该 Application/read model。调用方 MUST NOT 直接写SQLite、提交完整 next state 或自行生成系统字段。

#### Scenario: Agent 完成语义 Review
- **WHEN** `task-review` Skill 已形成完整语义结果
- **THEN** Skill MUST 只把允许的语义字段交给 Application `record`
- **AND** Application MUST 独占 schema 校验、系统时间、slot选择、serialization、digest 与 persistence effects

#### Scenario: Buildr Web 查看 Result
- **WHEN** Buildr Web 请求 Task Review 详情
- **THEN** HTTP interface MUST 调用 Application `inspect`，MUST NOT 直接读取SQLite、计算 digest 或判断 applicability

#### Scenario: terminal Task 被读取或写入
- **WHEN** 调用方 inspect completed/abandoned Task
- **THEN** Application MUST 允许读取已有 Result
- **AND** 对 terminal Task 的 record MUST fail closed

## REMOVED Requirements

### Requirement: Task Review Application 必须是唯一 Result writer
Buildr MUST 由一个共享 Task Review Application 实现 `inspect` 与 `record`，并 MUST 让 CLI、Skill 与 Local App 复用该 Application/read model。调用方 MUST NOT 直接写SQLite、提交完整 next state 或自行生成系统字段。

#### Scenario: Agent 完成语义 Review
- **WHEN** `task-review` Skill 已形成完整语义结果
- **THEN** Skill MUST 只把允许的语义字段交给 Application `record`
- **AND** Application MUST 独占 schema 校验、系统时间、slot选择、serialization、digest 与 persistence effects

#### Scenario: Local App 查看 Result
- **WHEN** Local App 请求 Task Review 详情
- **THEN** HTTP interface MUST 调用 Application `inspect`，MUST NOT 直接读取SQLite、计算 digest 或判断 applicability

#### Scenario: terminal Task 被读取或写入
- **WHEN** 调用方 inspect completed/abandoned Task
- **THEN** Application MUST 允许读取已有 Result
- **AND** 对 terminal Task 的 record MUST fail closed
