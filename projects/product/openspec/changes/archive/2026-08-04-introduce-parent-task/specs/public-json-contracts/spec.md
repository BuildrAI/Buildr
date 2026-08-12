## ADDED Requirements

### Requirement: Task JSON 必须稳定表达 Parent 与直接 Children
Task Record operation JSON MUST 使用新的 major schema identity，并 MUST 在 record 中明确返回 nullable `parentTaskId` 与排序后的 `childTaskIds`。该 read model MUST NOT 暴露数据库 row id、SQL、路径、祖先闭包或递归 Task 正文。

#### Scenario: 独立 Task JSON
- **WHEN** create/inspect/list 返回没有 Parent 和 Children 的 Task
- **THEN** record MUST 包含 `parentTaskId: null` 与空 `childTaskIds`
- **AND** schema registry MUST 验证字段和 major identity

#### Scenario: Parent 与 Child JSON
- **WHEN** inspect 返回存在直接层级关系的 Task
- **THEN** Child MUST 返回直接 `parentTaskId`，Parent MUST 返回排序后的直接 `childTaskIds`
- **AND** MUST NOT 递归嵌入关联 Task record

#### Scenario: 旧 JSON consumer
- **WHEN** 新字段改变 closed Task Record shape
- **THEN** 产品 MUST 提升公开 Task operation schema major
- **AND** docs、registry 与 contract tests MUST 同步更新

