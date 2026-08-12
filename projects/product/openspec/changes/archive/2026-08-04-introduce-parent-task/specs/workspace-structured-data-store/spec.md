## ADDED Requirements

### Requirement: Parent Task schema 必须通过连续 migration 演进
Buildr MUST 通过 `0002_create_parent_task_relations.sql` 建立 purpose-built `task_parent_relations` table、Child/Parent foreign keys 与 Parent 查询索引，且 MUST NOT 改写或重建 `0000`、`0001` 及既有 Task tables。现有 Task rows MUST 在升级后保持无 Parent。

#### Scenario: version 1 数据库升级
- **WHEN** current runtime 首次 writable 打开已应用到 version 1 的健康数据库
- **THEN** runner MUST 原子应用 `0002` 并登记匹配 checksum
- **AND** 既有 Task 的逻辑内容与状态 MUST 保持不变

#### Scenario: Parent foreign key 无效
- **WHEN** repository 尝试保存不存在的 Parent Task ID
- **THEN** SQLite 与 Application validation MUST 阻止该 mutation
- **AND** transaction MUST rollback 且 ledger MUST 保持 current

#### Scenario: Parent 查询使用稳定索引
- **WHEN** repository 查询某 Task 的直接 children
- **THEN** `task_parent_relations` MUST 提供按 `parent_task_id` 定位 Child 的索引
- **AND** MUST NOT 需要扫描旧 YAML 或建立递归闭包表
