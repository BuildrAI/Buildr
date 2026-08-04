## MODIFIED Requirements

### Requirement: Parent Task schema 必须通过连续 migration 演进
Buildr MUST 通过连续 migration 将 Parent Task 持久化收敛为 nullable `tasks.parent_task_id` self-reference foreign key，并 MUST 为直接 Children 查询建立 `tasks(parent_task_id, task_id)` 索引。latest Schema MUST NOT 保留 `task_parent_relations` table 或其索引；已应用 migration 的原始 bytes 与 checksum MUST NOT 被改写。

#### Scenario: version 1 数据库升级
- **WHEN** current runtime 首次 writable 打开已应用到 version 1 的健康数据库
- **THEN** runner MUST 按顺序原子应用尚未登记的连续 migrations 并登记各自匹配 checksum
- **AND** 既有 Task 的逻辑内容与状态 MUST 保持不变，且升级后 `parent_task_id` MUST 为 `NULL`

#### Scenario: version 2 数据库升级
- **WHEN** current runtime 首次 writable 打开已应用到 version 2、包含 `task_parent_relations` 的健康数据库
- **THEN** runner MUST 原子应用 `0003_inline_parent_task_column.sql` 并登记匹配 checksum
- **AND** 已有 Parent/Child 关系与其他 Task 逻辑内容 MUST 保持不变
- **AND** transaction 完成后 MUST 只由 `tasks.parent_task_id` 保存 Parent 关系

#### Scenario: fresh 数据库达到 latest Schema
- **WHEN** current runtime 初始化新的 Workspace Structured Store
- **THEN** 全部连续 migrations 完成后 `tasks` MUST 包含 nullable `parent_task_id` self-reference foreign key
- **AND** latest Schema MUST NOT 包含 `task_parent_relations` table 或 `task_parent_relations_parent_idx`

#### Scenario: Parent foreign key 无效
- **WHEN** repository 尝试保存不存在的 Parent Task ID
- **THEN** SQLite 与 Application validation MUST 阻止该 mutation
- **AND** transaction MUST rollback 且 ledger MUST 保持 current

#### Scenario: Parent 查询使用稳定索引
- **WHEN** repository 查询某 Task 的直接 children
- **THEN** `tasks_parent_task_idx` MUST 提供按 `parent_task_id`、`task_id` 定位并排序 Child 的索引
- **AND** MUST NOT 需要扫描旧 YAML、关系表或建立递归闭包表
