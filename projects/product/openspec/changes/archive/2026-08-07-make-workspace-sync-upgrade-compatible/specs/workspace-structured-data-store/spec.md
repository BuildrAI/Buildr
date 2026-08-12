## MODIFIED Requirements

### Requirement: SQLite schema 必须只由完整版本化 SQL scripts 演进
Buildr MUST 从随产品交付的 `src/infrastructure/sqlite/migrations/NNNN_snake_case.sql` 建立和演进 schema。migration runner MUST 要求版本从 `0000` 连续递增、名称唯一、无缺口，并 MUST 在 `schema_migrations` 中保存 version、name、script checksum 与 applied time；已应用 script 的 identity MUST NOT 被静默改写。显式 workspace `update` 或 `sync` 在其 source mutation 前 MUST 能调用同一 canonical writable migration boundary 应用全部 pending scripts；普通只读操作 MUST NOT 因 pending migration 自行写库。

#### Scenario: 初始化全新数据库
- **WHEN** 首次 writable workspace lifecycle action 打开一个不存在的 Workspace 数据库
- **THEN** runner MUST 按版本顺序执行 `0000_create_migration_ledger.sql` 及全部 current scripts
- **AND** 每个成功版本 MUST 在同一 transaction 中写入匹配的 version、name 和 SHA-256 checksum

#### Scenario: sync 升级 pending 数据库
- **WHEN** 用户对 ledger 尚未包含全部 current scripts 的健康 Workspace 执行显式 `buildr sync <agent> --target <workspace>`，且 sync source preflight 已通过
- **THEN** sync MUST 在任何受管源资产 mutation 前按版本顺序应用全部 pending migrations
- **AND** sync MUST 使用 retained canonical writer provenance、现有 bounded transaction 和 ledger checksum 规则
- **AND** source mutation 只有在 migration 全部成功后才能开始

#### Scenario: 重复打开 current 数据库
- **WHEN** ledger 已包含全部 current scripts 且 version/name/checksum 完全一致
- **THEN** runner MUST 返回 current 并执行零条 migration
- **AND** MUST NOT更新时间、重写 schema 或生成重复 ledger row

#### Scenario: script 序列缺失或重复
- **WHEN** package migration assets 存在版本缺口、重复版本、非法名称或缺失 `0000`
- **THEN** Buildr MUST 在执行任意待应用 SQL 前返回 schema-assets-invalid
- **AND** MUST 保持数据库和 ledger 不变

#### Scenario: 已应用 script 漂移
- **WHEN** ledger 中任一已应用 version 的 name 或 checksum 与当前 package script 不一致
- **THEN** Buildr MUST 返回 migration-drift 并 fail closed
- **AND** MUST 要求通过新的连续 migration 修正，不得更新旧 ledger 或重新执行被修改的 script

#### Scenario: 数据库版本超前
- **WHEN** ledger 包含当前 package 不认识的更高 migration version
- **THEN** Buildr MUST 返回 database-newer-than-runtime
- **AND** MUST NOT降级、删除表、截断 ledger 或继续业务读写

