## Context

当前 Task Record repository 以 `.buildr/tasks/<task-id>/task.yml` 为唯一 authority。它适合单记录读写和人工检查，但 Task 列表需要目录扫描，关系、索引、聚合和跨记录一致性会继续放大文件系统 adapter 的复杂度。用户已经确认 Buildr Local 是单机版：SQLite 数据只在当前 Workspace、当前机器使用；未来组织协作由独立的 Buildr Server 或 Buildr Cloud authority 负责，不通过同步 SQLite 文件实现。

Buildr 尚未正式发布，因此本 Change 可以干净切断旧 `task.yml` 数据，不建立 importer、legacy reader 或双写阶段。与此同时，Buildr 是自举 workspace；本 Change 自己的 Task identity 必须在新 authority 启用后显式重建，才能继续 Development、Verification 和 Finish。

当前 Buildr Workspace 固定 Node 23.10.0，公开 package 声明 Node `>=20`。Node 23 已 EOL；Node 24 是 LTS，且官方 `node:sqlite` 从 Node 24.15.0 起达到 release-candidate 稳定度。采用内置模块可以避免 native npm addon、prebuild matrix 和额外运行时依赖，但要求同步提高 Buildr 的 Node 最低版本。

## Goals / Non-Goals

**Goals:**

- 建立可被后续领域复用、但不携带 Task 业务语义的 Workspace SQLite infrastructure。
- 以完整、可审计的 SQL scripts 管理 schema 初始化和后续演进。
- 将 Task Record 的创建、读取、列表、更新和终态写入切换到事务化 SQLite repository。
- 保持 Domain/Application、CLI、Local App 和其他 lifecycle Applications 不直接依赖 SQL 或表结构。
- 对数据库缺失、版本超前、script 漂移、migration 失败、busy、损坏和 integrity failure 返回稳定诊断。
- 让 checkout、npm package 和自举 runtime 使用相同 migration assets 与行为。

**Non-Goals:**

- 不迁移、扫描、导入、读取或删除旧 `task.yml`。
- 不实现 Parent Task、依赖图、自动状态聚合或 Board 替换。
- 不迁移 Environment、Development、Review、Verification 或 Finish records。
- 不同步、提交、发布或备份 SQLite 数据库。
- 不实现 Buildr Server、Buildr Cloud、账号、权限、多用户并发或远程 repository。
- 不建立通用 ORM、query builder、event store 或跨 Workspace 全局数据库。

## Decisions

### 1. 一个 canonical Workspace 一个本地数据库

数据库固定为 `.buildr/local/workspace.sqlite`，其 `-wal`、`-shm` sidecar 和整个 `.buildr/local/` 均为 machine-local，不属于 Work Asset、Task Metadata Publication 或 Git 内容。所有入口先按既有 Workspace identity/canonical-root 边界解析 target；不得从 cwd、task worktree 或数据库内容反向猜 Workspace。

选择 Workspace-scoped 数据库而不是用户级全局数据库，是为了保持 Workspace identity、删除/重置范围和故障影响面明确。选择单一 Workspace 数据库而不是每个领域一个文件，是为了让未来合法的本地关系与事务能够共享同一个 schema lifecycle；每个领域仍拥有自己的表和 repository。

### 2. 使用 Node 24 LTS 的内置 `node:sqlite`

Buildr Workspace Node 升级到当前选定的 Node 24 LTS patch，package engine 提高到 `>=24.15.0`。SQLite adapter 使用同步 `DatabaseSync`，与当前同步 Application/CLI 调用模型一致。

未选择 `better-sqlite3`/`sqlite3`，因为 native addon 会扩大 npm 安装、平台 prebuild 和 Candidate/Release 验证面；未选择 WASM SQLite，因为文件持久化、锁和真实 SQLite transaction 语义会变得间接；未选择调用系统 `sqlite3` binary，因为它会增加未受管外部 Command 依赖。最低 Node 版本变化属于本 Change 的显式 breaking impact。

### 3. SQL scripts 是 schema 的唯一演进输入

随 package 交付以下有序 migration assets：

```text
src/infrastructure/sqlite/migrations/
  0000_create_migration_ledger.sql
  0001_create_task_store.sql
```

runner 只接受 `NNNN_snake_case.sql`，按数字顺序加载，并要求从 `0000` 连续、无重复、无缺口。`0000` 创建 `schema_migrations(version, name, checksum, applied_at)`；每个 script 的原始 package bytes 计算 SHA-256。已应用版本的 name/checksum 必须与 package script 完全一致，版本超前或 checksum 漂移直接 blocked，不自动修正。

每个待应用 script 使用独立 `BEGIN IMMEDIATE` transaction：执行 SQL、插入 ledger row、`COMMIT`；任一步失败执行 `ROLLBACK`，不得登记部分 migration。SQL DDL 不复制进 JavaScript；JavaScript 只负责发现、验证、事务和诊断。未来 Parent Task 必须通过新的连续 script 演进，不改写 `0001`。

### 4. 数据库按写入惰性初始化，读取保持零写入

Task `create` 是第一个需要结构化存储的 mutation：数据库不存在时创建 `.buildr/local/`、打开数据库并应用全部 scripts。`inspect`/`list` 在数据库不存在时分别返回 not-found/空列表，不创建目录、数据库或 ledger；数据库存在时使用 read-only connection 并验证已应用 schema。

这保持现有 inspect/list 的零写入语义，也避免 Workspace 初始化被 SQLite 可用性不必要地阻塞。Doctor 对数据库不存在返回“尚未初始化”的非错误观察；存在时检查 script identity、foreign keys、schema version 和 `PRAGMA integrity_check`。

### 5. Task 使用规范化关系表，不保存整份 JSON blob

`0001_create_task_store.sql` 建立：

- `tasks`：`task_id`、record schema、title、intent、status、终态 result、`created_at`、`updated_at`；使用 CHECK 约束保护状态/result 组合。
- `task_projects`：Task 与 Project scope，复合主键并外键到 `tasks`。
- `task_services`：Task 与 `project/service` scope，复合主键并外键到 `tasks`。
- `task_changes`：Task 与 `project/change` 引用，复合主键并外键到 `tasks`。
- 针对 `status`、`updated_at` 和关系查询建立明确索引。

Task repository 在 transaction 内写主记录和全部关系集合，读取后交给现有 closed domain normalizer 重新验证。表不保存 Environment、Development、Review、Verification、Finish、数据库 path、row id 或未来 Parent Task 字段。

未选择单 JSON blob，是因为这会继续阻碍 scope/reference 索引与后续关系扩展；未提前加入 `parent_task_id`，因为 Parent Task 是独立语义 Change，必须通过后续 migration 明确引入。

### 6. repository transaction 和响应 digest 保持 Application 边界

所有 mutation 在 `BEGIN IMMEDIATE` 后读取最新 record、执行 Application 明确动作、完整 domain validation，再写主表和关系表并提交。Local App 的 `expectedRecordDigest` 在同一 transaction 内与最新逻辑记录比较；冲突时 rollback 并返回既有 `task_record_conflict`，不自动合并。

`recordDigest` 改为对 domain normalizer 输出的 canonical logical record JSON 计算 SHA-256，不依赖 SQLite 文件页、row order、WAL 或 query plan。Public result 升级为 `buildr.task-record-result/v2`，删除 canonical `path`，也不暴露数据库 path、table、row id 或 SQL；调用方只依赖 Task identity、record、digest、effects 和 diagnostic。所有 checkout、npm package、Local App 和 capability contract consumer 在同一 Change 切换，不保留 v1 alias。

### 7. publication 只排除 Task Record，不扩大到其他 lifecycle records

Task Record writer declaration 不再返回 portable path，SQLite 数据库绝不进入 publication。Task Metadata Publication 仍可组合 Development、Verification 和两个 Review exact paths；这些模块是否迁入结构化存储由后续独立 Change 决定。Publication 必须通过 Task Application 确认 Task identity，而不是要求 `task.yml` 存在。

### 8. 自举切换采用显式重建，不采用数据迁移

实现和直接测试完成后，候选 Task Application 在 canonical Workspace 的新数据库中显式执行 `task create introduce-workspace-sqlite-task-store`，使用当前已确认 title、intent、scope 和 Change reference。它不读取旧 YAML、不保留旧时间、不扫描其他 Task，也不删除旧文件。随后用新 Application inspect 同一 Task，并恢复 Environment/Development applicability；只有这条自举证据成立才进入正式 Verification。

旧 CLI/runtime 在集成前仍以 YAML 管理当前 Task；新 authority 启用后忽略这些文件。回滚代码时旧 YAML 仍在，但新数据库创建的数据不会反向导出；开发期需要重置时只在精确确认 `.buildr/local/workspace.sqlite*` ownership 后执行显式本地清理，不提供自动 destructive rollback。

## Risks / Trade-offs

- **[Node 最低版本提高影响现有安装]** → 在 package engine、Workspace Node、bootstrap/installer、checkout 与 npm package smoke 中同时验证，旧 Node 返回清晰版本诊断。
- **[`node:sqlite` 仍是 release-candidate API]** → 只使用 `DatabaseSync`、prepared statements、transaction 和基础 PRAGMA，不采用 session/extension/experimental advanced APIs；以 Node 24 LTS 精确 patch 作为自举 runtime。
- **[SQL script 被发布后修改导致现有数据库不可判定]** → ledger 保存 checksum，任何已应用 script 漂移 fail closed；修正只能新增 migration。
- **[并发 CLI/Local App 写入产生 busy]** → 使用 WAL、`busy_timeout` 和短 `BEGIN IMMEDIATE` transaction；超时返回稳定 blocked，不实现锁服务或租约。
- **[数据库损坏影响全部本地 Task]** → Doctor 执行 integrity check，repository 不自动重建或覆盖；本 Change 数据可显式重置，但不把“可重置”伪装成自动恢复。
- **[其他模块仍在 `.buildr/tasks/<task-id>/` 形成混合存储]** → 通过 Application/repository ownership 保持边界，SQLite 不接管 sibling files；后续按真实查询需求逐模块决策。
- **[当前自举 Task 在切换时丢失]** → 把显式同 ID 重建和新 Application inspect 设为实现任务与验收场景，不引入通用 importer。

## Migration Plan

1. 升级并验证 Node 24 LTS runtime/engine，加入 SQLite infrastructure 和 migration scripts。
2. 先以临时 Workspace 验证 fresh initialization、重复 open、连续 migrations、checksum/version/busy/corruption failure 与 package asset presence。
3. 实现 SQLite Task repository 并切换 compose root；更新 CLI、Local App、publication、Doctor、文档和 current knowledge。
4. 在隔离 fixtures 中证明旧 `task.yml` 不被读取或导入，新数据库可完整执行 Task lifecycle consumer journeys。
5. 用候选 Application 在 canonical Workspace 显式重建当前 Task ID，检查新 authority 下的 Task、Environment 和 Development applicability。
6. 完成 Change convergence、正式 Verification、Candidate/Review/handoff 与 Finish；同步 retained runtime 后再次运行 Doctor。

## Open Questions

无。Parent Task schema 和 Server/Cloud repository contract 留给后续独立 Change。
