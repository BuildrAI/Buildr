## ADDED Requirements

### Requirement: Task Record writer 必须声明 portable publication path
Task Record writer MUST 声明 `buildr.task-record/v1` 唯一拥有 `.buildr/tasks/<task-id>/task.yml`，该普通文件为portable publication eligible；声明 MUST NOT扩大到Task目录、专业sibling或record内的非持久read-model字段。

#### Scenario: Metadata Publication 请求Task Record ownership
- **WHEN** `task-metadata-publication` 为一个合法Task ID组合writer declarations
- **THEN** Task Record writer declaration MUST只返回 `.buildr/tasks/<task-id>/task.yml`
- **AND** MUST NOT包含 `recordDigest`、Environment、Development、Review、Verification或Finish路径

#### Scenario: 历史引用当前不可用
- **WHEN** 有效Task Record包含archived、retired或当前unavailable的Project/Service/Change引用
- **THEN** Task Record read model MUST保留原record bytes并返回availability diagnostic
- **AND** publication MUST NOT要求writer改写历史记录才能共享
