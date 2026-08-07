# workspace-structured-data-store Specification

## Purpose

定义单机 Workspace SQLite 数据库的本地边界、schema scripts、版本演进、事务、完整性检查和诊断。

## Requirements

### Requirement: Workspace 本地结构化存储必须是单机且不参与同步
Buildr MUST 为每个 Workspace root 使用该 root 唯一的 `.buildr/local/workspace.sqlite` 作为 Workspace 本地结构化存储，并 MUST 将数据库、WAL/SHM sidecar 和 `.buildr/local/` 中的运行状态排除在 Git、Work Asset 与跨机器同步之外。canonical、candidate 和 validation Workspace MUST 各自使用自身 root 的 store，任何 store MUST NOT 被描述为 Buildr Server、Buildr Cloud 或组织协作 authority，Task current records MUST NOT 通过 Git 或本地数据库同步进行分享。

#### Scenario: 首个结构化 writer 创建数据库
- **WHEN** 某 Workspace root 中尚无本地数据库，且合法结构化 writer 执行首次 mutation
- **THEN** Buildr MUST 只在该 Workspace root 的 `.buildr/local/` 创建数据库并完成 current schema 初始化
- **AND** MUST NOT 创建用户级全局数据库、远程连接、同步记录或 Git publication path

#### Scenario: task worktree 不能成为数据库 authority
- **WHEN** 调用方以 linked task worktree、副本或无法证明的路径作为结构化存储 target
- **THEN** Buildr MUST 在打开或创建数据库前 fail closed
- **AND** MUST NOT 从 cwd、branch、数据库内容或目录名反向推断 canonical Workspace

#### Scenario: candidate 或 validation Workspace 使用自身 store
- **WHEN** candidate 或 validation runtime 对其自身 Workspace root 执行合法 writable action
- **THEN** Buildr MUST 只创建或修改该 root 的 `.buildr/local/workspace.sqlite` 及其 sidecar
- **AND** MUST NOT 复用、写入或同步 retained canonical Workspace 的 structured store

#### Scenario: candidate runtime 尝试把 canonical store 作为 target
- **WHEN** candidate runtime 以 retained canonical Workspace root 作为 writable structured store target
- **THEN** Buildr MUST 在打开或创建数据库前 fail closed
- **AND** MUST NOT 创建 SQLite、WAL/SHM、目录、ledger row 或业务数据 mutation

#### Scenario: 已解析 Workspace 的只读打开
- **WHEN** Application 已将请求解析到合法 Workspace root，且只读调用打开该 root 的 structured store
- **THEN** Buildr MUST 只读取该 root 的 local store 或返回 not-found
- **AND** MUST NOT 从 Git、branch、worktree 或 cwd 重新推断 canonicality

#### Scenario: Git 检查本地数据库
- **WHEN** Git scope 或 Work Asset discovery 遇到 `.buildr/local/workspace.sqlite*`
- **THEN** Buildr MUST 将其保持为 machine-local excluded data
- **AND** MUST NOT stage、commit、push、声明 portable owner 或把数据库缺失解释为远端数据丢失

#### Scenario: Git 或 publication 检查本地数据库
- **WHEN** Git scope 或遗留 publication caller 遇到 `.buildr/local/workspace.sqlite*`
- **THEN** Buildr MUST 将其保持为 machine-local excluded data，且 publication capability MUST 不可路由
- **AND** MUST NOT stage、commit、push、声明 portable owner 或把数据库缺失解释为远端数据丢失

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

### Requirement: Task current records 必须使用最小 SQLite current-state schema
Workspace Structured Store MUST 以独立窄表保存 Task Development current Receipt、Task Verification current Result 与 Planning/Completion Review current Results。每个专业表 MUST 以 `tasks(task_id)` foreign key 绑定 canonical Task；Development 与 Verification 每个 Task 至多一行，Review 每个 Task 与 `planning|completion` type 至多一行。表 MUST 只保存定位/完整性字段和对应 Domain 已验证的完整 closed payload，MUST NOT 建设通用 metadata key/value、history、event、audit、revision、lease、lock、CAS、scheduler 或 sync state。

#### Scenario: fresh Workspace 初始化 latest schema
- **WHEN** current runtime 首次 writable 打开新的 canonical Workspace Structured Store
- **THEN** 连续 migrations MUST 建立三个专业 current-state tables、foreign keys、唯一 slots 与真实读取所需 indexes
- **AND** MUST NOT 建立旧 YAML import、publication、history 或同步 tables

#### Scenario: 已有 current schema 连续升级
- **WHEN** 健康数据库已应用到前一 current version
- **THEN** runner MUST 通过新的连续 migration 原子建立 Task current-state tables并登记匹配 checksum
- **AND** MUST NOT 修改任何已应用 migration 的 bytes、name 或 checksum

#### Scenario: 不存在的 Task 被专业 writer 引用
- **WHEN** Development、Verification 或 Review repository 尝试为不存在的 Task ID 写入 current payload
- **THEN** foreign key 与 Application validation MUST 拒绝 mutation
- **AND** transaction MUST rollback并保留全部已有 current rows

#### Scenario: 专业 current value 被替换
- **WHEN** 对应 Domain 已验证一份完整新 current value 且 repository 开始 mutation
- **THEN** repository MUST 在单一 transaction 中替换精确 slot、写后读取验证并提交
- **AND** 任一失败 MUST rollback并保留最后一份有效 current value及其他专业 slots

#### Scenario: terminal Task 的专业事实被读取
- **WHEN** completed 或 abandoned Task 已存在合法专业 current records
- **THEN**各专业 Application MUST 仍可只读返回其 current records
- **AND** Structured Store MUST NOT 因 Task terminal 而删除或隐藏这些 rows

#### Scenario: 旧 File Store records 仍然存在
- **WHEN** `.buildr/tasks/<task-id>/development.yml`、`verification.yml` 或 `reviews/*.yml` 存在、损坏或与 SQLite 不同
- **THEN** current runtime MUST 完全忽略这些 files且只读取 SQLite rows
- **AND** MUST NOT 迁移、双写、重建或因旧 files 存在而阻塞 SQLite mutation

### Requirement: canonical Workspace Structured Store 必须验证 writer runtime provenance
Buildr MUST 在创建数据库、打开 writable connection、应用 migration 或写入 canonical Workspace Structured Store 前，验证 caller runtime source 对 target canonical Workspace 的 writer provenance。来自与 target 共享 Git common-dir 的 linked task worktree、候选 checkout 或无法证明为 retained controller 的自举 runtime MUST 在任何 SQLite/filesystem mutation 前被拒绝；CLI、HTTP、Local App 与 internal driver MUST 经过同一保护边界。该 writer 规则 MUST NOT 延伸为对已解析 root 的只读 Git/worktree 观察，也 MUST NOT 降低普通用户 Workspace 对其已安装/retained runtime 的合法单库写入能力。

#### Scenario: candidate runtime 尝试写 canonical database
- **WHEN** 自举 task worktree 中的 candidate Buildr runtime 将 canonical retained Workspace 作为 Structured Store target 执行任一 writable Task、migration 或 repository action
- **THEN** Buildr MUST 返回稳定的 writer-provenance rejection diagnostic
- **AND** MUST NOT 创建 SQLite、WAL/SHM、目录、ledger row、schema 或业务数据 mutation

#### Scenario: retained controller 写 canonical database
- **WHEN** receipt-pinned retained controller 对其 canonical Workspace 执行合法 writable action
- **THEN** Buildr MUST 允许现有 transaction 与连续 migration 行为继续执行
- **AND** MUST 保持 checksum、database-newer-than-runtime、integrity 和 busy 的现有 fail-closed 语义

#### Scenario: 普通用户 Workspace 写自己的 database
- **WHEN** 非自举候选 topology 中的 Buildr runtime 对其 Workspace root 执行合法 writable action
- **THEN** provenance guard MUST 不得仅因该 runtime 不在自举 retained checkout 而拒绝
- **AND** Buildr MUST 继续只使用该 Workspace 的唯一 local-only Structured Store

#### Scenario: 已解析 root 的只读调用不观察 Git
- **WHEN** Application 对已经解析的 canonical、candidate 或 validation Workspace root 执行只读 structured store action
- **THEN** store infrastructure MUST 完成读取或返回稳定的 not-found/health diagnostic
- **AND** MUST NOT 调用 checkout observer、`git rev-parse` 或其他 Git/worktree provenance 命令

### Requirement: canonical migration 只能由已集成 retained runtime 激活
Buildr MUST 只允许已携带当前 migration assets 的 retained controller 升级 canonical Workspace Structured Store。候选 migration MUST 先在独立 Task Validation Workspace 验证；失败、放弃或未集成候选 MUST NOT 修改 canonical ledger、删除 canonical schema 或生成 down migration。

#### Scenario: 候选 migration 验证失败或任务放弃
- **WHEN** candidate runtime 在 Task Validation Workspace 中的 migration 或测试失败，或该 Task 被放弃
- **THEN** Buildr MUST 只清理该 Task-owned validation store/Workspace
- **AND** canonical database 的 schema、ledger 和业务数据 MUST 保持不变

#### Scenario: 已集成 runtime 首次写 canonical database
- **WHEN** 含新 migration 的最终候选已进入 retained checkout，且 retained controller 对 canonical Workspace 执行下一次合法 writable action
- **THEN** runner MUST 依现有连续 migration 规则原子应用新 script 并登记 checksum
- **AND** MUST NOT 导入 Task Validation Workspace 的任何测试或任务数据

### Requirement: Environment current 必须使用独立窄 SQLite schema
Workspace Structured Store MUST 以独立 `task_environment_current` table 保存每个正式 Task 的 Environment current Receipt。该表 MUST 使用 `task_id` 作为唯一主键并以 foreign key 绑定 `tasks(task_id)`，至少保存经过 Domain 校验的 `receipt_json`、可查询的 `status` 和 `updated_at`；MUST NOT 把 Environment 字段并入 `tasks`、建设通用 key/value/history/event/audit 表或复制完整 Receipt 到 `task_lifecycle_current`。

#### Scenario: fresh Workspace 初始化 Environment schema
- **WHEN** current runtime 初始化新的 Workspace Structured Store
- **THEN** 连续 migrations MUST 建立 `task_environment_current`、Task foreign key、JSON validity constraint 与唯一 current slot
- **AND** MUST NOT 建立 Environment file index、双写 ledger、history 或远端同步 table

#### Scenario: 已有 Workspace 升级
- **WHEN** 健康数据库已应用到前一 migration version 且 retained controller 执行合法 writable action
- **THEN** runner MUST 原子应用新的 Environment migration 并登记准确 checksum
- **AND** MUST 保留已有 Task、专业 current rows、Finish rows 与 lifecycle rows

#### Scenario: Environment current value 被替换
- **WHEN** Task Environment Application 已完成 Domain normalization 并开始保存完整新 current Receipt
- **THEN** repository MUST 在单一 transaction 中替换精确 `task_id` slot，写后读取验证并提交
- **AND** 任一校验、busy、foreign key 或 integrity failure MUST rollback并保留最后一份有效 current value；lifecycle projection failure MUST 保留 current authority 并返回可诊断结果

#### Scenario: 不存在的 Task 被 Environment writer 引用
- **WHEN** Environment Application 尝试为不存在的 Task ID 写入 current Receipt
- **THEN** foreign key 与 Application validation MUST 拒绝 mutation
- **AND** transaction MUST rollback并保留其他 Environment rows

### Requirement: Environment current migration 必须隔离旧文件输入
Environment legacy importer MUST 只在明确的 retained migration boundary 读取合法 `environment.json`，并 MUST 在导入前验证普通文件、canonical Workspace、Task identity、schema 和 ownership。正常 SQLite read/write、Local App GET、Environment inspect 与生命周期 mutation MUST NOT 扫描或解析旧 Environment 文件。

#### Scenario: Local App 读取 SQLite Environment
- **WHEN** Local App 请求已登记 Workspace 中某 Task 的 Environment
- **THEN** Application MUST 从 `task_environment_current` 返回最近一次保存的 current read model
- **AND** MUST NOT 读取 `environment.json`、执行文件 inventory 或从 lifecycle snapshot 缺失回退到文件

#### Scenario: migration 输入不可信
- **WHEN** legacy importer 发现 symlink、路径逃逸、文件占用、损坏 JSON 或不匹配的 Task/Workspace identity
- **THEN** importer MUST fail closed并保留原输入与已有数据库
- **AND** MUST NOT 猜测归属、删除文件或创建部分 current rows

#### Scenario: candidate store migration
- **WHEN** candidate runtime 验证 Environment migration
- **THEN** migration MUST 使用 candidate/validation Workspace 自身 structured store
- **AND** MUST NOT 打开 retained store、写 retained WAL/SHM 或把 fixture rows 回灌 canonical database
