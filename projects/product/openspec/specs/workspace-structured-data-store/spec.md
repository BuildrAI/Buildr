# workspace-structured-data-store Specification

## Purpose

定义单机 Workspace SQLite 数据库的本地边界、schema scripts、版本演进、事务、完整性检查和诊断。

## Requirements

### Requirement: Workspace 本地结构化存储必须是单机且不参与同步
Buildr MUST 为每个 canonical Workspace 使用唯一 `.buildr/local/workspace.sqlite` 作为 Workspace 本地结构化存储，并 MUST 将数据库、WAL/SHM sidecar 和 `.buildr/local/` 中的运行状态排除在 Git、Task Metadata Publication、Work Asset 与跨机器同步之外。该存储 MUST NOT 被描述为 Buildr Server、Buildr Cloud 或组织协作 authority。

#### Scenario: 首个结构化 writer 创建数据库
- **WHEN** canonical Workspace 中尚无本地数据库，且合法结构化 writer 执行首次 mutation
- **THEN** Buildr MUST 只在该 Workspace 的 `.buildr/local/` 创建数据库并完成 current schema 初始化
- **AND** MUST NOT 创建用户级全局数据库、远程连接、同步记录或 Git publication path

#### Scenario: task worktree 不能成为数据库 authority
- **WHEN** 调用方以 linked task worktree、副本或无法证明的路径作为结构化存储 target
- **THEN** Buildr MUST 在打开或创建数据库前 fail closed
- **AND** MUST NOT 从 cwd、branch、数据库内容或目录名反向推断 canonical Workspace

#### Scenario: Git 或 publication 检查本地数据库
- **WHEN** Git scope、Task Metadata Publication 或 Work Asset discovery 遇到 `.buildr/local/workspace.sqlite*`
- **THEN** Buildr MUST 将其保持为 machine-local excluded data
- **AND** MUST NOT stage、commit、push、声明 portable owner 或把数据库缺失解释为远端数据丢失

### Requirement: SQLite schema 必须只由完整版本化 SQL scripts 演进
Buildr MUST 从随产品交付的 `src/infrastructure/sqlite/migrations/NNNN_snake_case.sql` 建立和演进 schema。migration runner MUST 要求版本从 `0000` 连续递增、名称唯一、无缺口，并 MUST 在 `schema_migrations` 中保存 version、name、script checksum 与 applied time；已应用 script 的 identity MUST NOT 被静默改写。

#### Scenario: 初始化全新数据库
- **WHEN** 首次 mutation 打开一个不存在的 Workspace 数据库
- **THEN** runner MUST 按版本顺序执行 `0000_create_migration_ledger.sql` 及全部 current scripts
- **AND** 每个成功版本 MUST 在同一 transaction 中写入匹配的 version、name 和 SHA-256 checksum

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

### Requirement: 每个 migration 必须原子应用且失败可诊断
Buildr MUST 使用独立 `BEGIN IMMEDIATE` transaction 执行每个待应用 SQL script，并 MUST 只在 script 全部成功后插入 ledger row 和提交。SQL、constraint、busy、I/O 或 ledger 写入失败 MUST rollback 当前版本，并返回包含 version、name 和稳定 code 的 sanitized diagnostic。

#### Scenario: migration 中途失败
- **WHEN** 某个 SQL statement 或 ledger insert 失败
- **THEN** runner MUST rollback 该 migration 的所有 schema/data effects
- **AND** MUST NOT把该 version 标记为已应用或继续执行后续 script

#### Scenario: migration 被并发 writer 占用
- **WHEN** runner 在 bounded busy timeout 内无法取得 migration write transaction
- **THEN** Buildr MUST 返回 database-busy 和重试 next action
- **AND** MUST NOT建立锁文件、租约、daemon 或部分 schema

#### Scenario: 下一次重新尝试
- **WHEN** 前一次 migration 已完整 rollback 且阻塞原因消失
- **THEN** runner MUST 从 ledger 中第一个未应用版本重新执行
- **AND** 已成功且 checksum current 的版本 MUST 保持不变

### Requirement: 数据库打开必须配置一致性与健康边界
Buildr MUST 在每个 writable connection 启用 foreign keys、WAL 和 bounded busy timeout，并 MUST 在业务操作前验证 migration identity。read-only operation MUST NOT创建数据库、目录、应用 migration 或改变 schema/业务数据；Doctor MUST 对存在的数据库检查 migration identity、foreign key configuration 和 `PRAGMA integrity_check`。

#### Scenario: 只读访问尚未初始化的 Workspace
- **WHEN** Task inspect/list 或 Doctor 读取尚无 `.buildr/local/workspace.sqlite` 的合法 Workspace
- **THEN** inspect MUST 返回 not-found、list MUST 返回空集合，Doctor MUST 返回未初始化的非错误观察
- **AND** 任一只读动作 MUST 产生零 filesystem/database effects

#### Scenario: current 数据库通过 Doctor
- **WHEN** 数据库 migration identity current、foreign keys 可启用且 integrity check 返回 ok
- **THEN** Doctor MUST 报告 Workspace structured store healthy 和 current version
- **AND** MUST NOT输出 Task 正文、SQL、数据库页或机器敏感信息

#### Scenario: 数据库损坏
- **WHEN** SQLite 无法打开数据库、schema 不可读或 integrity check 失败
- **THEN** repository 和 Doctor MUST 返回稳定 corruption/integrity diagnostic
- **AND** MUST NOT自动删除、重建、覆盖或从旧 YAML 恢复数据库

### Requirement: Buildr SQLite runtime 必须使用受支持的 Node LTS 能力
Buildr MUST 使用 Node 24.15.0 或更高受支持版本提供的 `node:sqlite` 基础 API，并 MUST 让 Workspace runtime、package engine、checkout、npm package 与 installer 对最低版本保持一致。SQLite repository MUST NOT依赖系统 `sqlite3` binary、native npm addon、动态 extension 或远程数据库。

#### Scenario: 受支持 Node runtime
- **WHEN** Buildr 在满足 package engine 的 Node runtime 中启动 SQLite-backed Task action
- **THEN** 产品 MUST 直接使用内置 `node:sqlite` 打开 Workspace 数据库
- **AND** package 安装 MUST 不要求编译或下载 SQLite native addon

#### Scenario: Node 版本过低
- **WHEN** runtime 低于声明的最低 Node 版本
- **THEN** launcher/CLI MUST 在业务数据库操作前返回明确 Node version diagnostic
- **AND** MUST NOT回退到文件 Task Store 或外部 sqlite command

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
