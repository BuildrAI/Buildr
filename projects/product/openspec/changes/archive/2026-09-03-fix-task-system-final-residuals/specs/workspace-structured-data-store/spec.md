## REMOVED Requirements

### Requirement: Task execution record metadata 必须使用独立有界 SQLite schema
**Reason**: Task Execution Record 已由 migration `0025_drop_task_execution_records.sql` 整体退役，最新 schema 不再存在该表或运行时入口。

**Migration**: 保留创建、演进和删除该表的连续历史 migration 字节及升级测试；fresh/upgrade 最新 schema 只验收当前仍存在的 Task Record、Review 与 Verification 表。

#### Scenario: 初始化或升级最新 Workspace
- **WHEN** retained runtime 初始化 fresh Workspace 或从历史 migration 升级
- **THEN** 最终 SQLite schema MUST不包含 `task_execution_records`
- **AND** 历史 migration checksum MUST保持不变
