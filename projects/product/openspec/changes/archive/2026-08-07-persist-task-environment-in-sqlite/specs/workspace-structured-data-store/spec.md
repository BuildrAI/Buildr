## ADDED Requirements

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
