## MODIFIED Requirements

### Requirement: Task Record writer 必须声明 local-only structured persistence
Task Record writer MUST声明 `buildr.task-record/v1` 的 persistence classification 为 Workspace-local structured data。声明 MUST NOT暴露数据库 path、table、row id、SQL、`recordDigest` 或扩大到其他 lifecycle owner；Development、Verification与Review虽进入同一SQLite，仍 MUST保持各自Application authority。

#### Scenario: consumer读取Task Record ownership
- **WHEN**合法consumer检查一个Task的持久化classification
- **THEN** Task Record writer MUST标记Workspace-local且不提供Git path
- **AND** MUST NOT包含旧`task.yml`、Environment、Development、Review、Verification或Finish路径

#### Scenario: Metadata Publication 请求 local-only Task Record ownership
- **WHEN**遗留caller尝试通过已清退的Metadata Publication取得Task Record ownership
- **THEN** capability graph MUST不存在可路由provider或binding，Task Record writer MUST不返回任何Git path
- **AND** MUST NOT导出数据库、旧`task.yml`或其他lifecycle owner的数据

#### Scenario: 历史引用当前不可用
- **WHEN**有效Task Record包含archived、retired或当前unavailable的Project/Service/Change引用
- **THEN** Task Record read model MUST保留逻辑record并返回availability diagnostic
- **AND** MUST NOT要求writer导出或改写Task Record才能继续读取其他专业current records
