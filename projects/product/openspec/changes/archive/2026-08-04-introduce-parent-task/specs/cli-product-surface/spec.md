## ADDED Requirements

### Requirement: Task CLI 必须在既有 action 中管理 Parent Task
`buildr task create` MUST 接受可选 Parent Task ID，`buildr task update` MUST 提供互斥的 set-parent 与 clear-parent 参数；inspect/list MUST 返回 Parent/Child read model。CLI MUST NOT 新增独立 graph、board 或 relation 顶层 action。

#### Scenario: CLI 创建 Child Task
- **WHEN** Agent 使用 `task create` 并提供 Parent Task ID
- **THEN** CLI MUST 调用同一 Task Record Application 创建关系
- **AND** JSON result MUST 返回 Child 的 Parent 与 Parent 可查询的直接 Child

#### Scenario: CLI reparent 或 clear
- **WHEN** Agent 对 active Task 使用 set-parent 或 clear-parent
- **THEN** CLI MUST 提交单一明确 mutation
- **AND** 同时提供、缺失参数或非法 identity MUST 在写入前失败

#### Scenario: CLI help 描述独立生命周期
- **WHEN** 用户查看 Task CLI 帮助
- **THEN** help MUST 说明 Parent/Child 只表达层级关系
- **AND** MUST NOT 暗示 Parent 自动调度、完成或验证 Child

