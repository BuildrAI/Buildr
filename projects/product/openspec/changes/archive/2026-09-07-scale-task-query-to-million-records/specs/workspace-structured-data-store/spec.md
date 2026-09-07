## ADDED Requirements

### Requirement: Workspace SQLite 必须提供可重建的百万级 Task 查询索引
Workspace Structured Store MUST 通过连续 migration 为 Task 信息流建立与 `active → todo → completed → abandoned`、`updated_at DESC`、`task_id ASC` 完全一致的可索引排序，并 MUST 建立以 canonical `tasks` 内容为 external content 的 FTS5 trigram 派生索引。派生索引 MUST 不成为 Task authority，且 MUST 能从 `tasks` 完整重建。

#### Scenario: 迁移现有 Workspace
- **WHEN** retained runtime 首次打开包含既有 Task 的旧 schema Workspace
- **THEN** migration MUST 在同一原子迁移中创建 feed index、FTS5 table、同步 triggers 并回填全部既有 Task
- **AND** migration 失败 MUST 回滚且不得改变既有 Task 或 migration ledger

#### Scenario: Task 写入后同步搜索索引
- **WHEN** Task 在业务事务中创建、修改 title/intent 或删除
- **THEN** FTS5 派生 row MUST 在同一 SQLite transaction 中插入、替换或删除
- **AND** 写入失败 MUST与 Task authority mutation 一起回滚

#### Scenario: 当前 Node 不支持 FTS5
- **WHEN** SQLite runtime 无法创建或读取声明的 FTS5 能力
- **THEN** Structured Store MUST fail closed 并返回可定位的 migration/runtime diagnostic
- **AND** MUST NOT 回退为百万级无索引子串扫描

#### Scenario: 核对查询计划
- **WHEN** verifier 对默认分页、单状态分页、Project/Service、Child、复盘和关键词路径运行 `EXPLAIN QUERY PLAN`
- **THEN** 查询 MUST 使用已声明的 feed/status/relation/parent/retrospective/FTS 索引完成候选过滤
- **AND** 默认分页 MUST NOT 使用 `OFFSET` 或为完整 tasks 集合建立临时 ORDER BY B-tree
