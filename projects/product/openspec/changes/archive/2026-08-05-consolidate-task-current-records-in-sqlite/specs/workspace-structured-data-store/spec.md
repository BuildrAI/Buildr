## MODIFIED Requirements

### Requirement: Workspace 本地结构化存储必须是单机且不参与同步
Buildr MUST 为每个 canonical Workspace 使用唯一 `.buildr/local/workspace.sqlite` 作为 Workspace 本地结构化存储，并 MUST 将数据库、WAL/SHM sidecar 和 `.buildr/local/` 中的运行状态排除在 Git、Work Asset 与跨机器同步之外。该存储 MUST NOT 被描述为 Buildr Server、Buildr Cloud 或组织协作 authority，Task current records MUST NOT 通过 Git 或本地数据库同步进行分享。

#### Scenario: 首个结构化 writer 创建数据库
- **WHEN** canonical Workspace 中尚无本地数据库，且合法结构化 writer 执行首次 mutation
- **THEN** Buildr MUST 只在该 Workspace 的 `.buildr/local/` 创建数据库并完成 current schema 初始化
- **AND** MUST NOT 创建用户级全局数据库、远程连接、同步记录或 Git publication path

#### Scenario: task worktree 不能成为数据库 authority
- **WHEN** 调用方以 linked task worktree、副本或无法证明的路径作为结构化存储 target
- **THEN** Buildr MUST 在打开或创建数据库前 fail closed
- **AND** MUST NOT 从 cwd、branch、数据库内容或目录名反向推断 canonical Workspace

#### Scenario: Git 检查本地数据库
- **WHEN** Git scope 或 Work Asset discovery 遇到 `.buildr/local/workspace.sqlite*`
- **THEN** Buildr MUST 将其保持为 machine-local excluded data
- **AND** MUST NOT stage、commit、push、声明 portable owner 或把数据库缺失解释为远端数据丢失

#### Scenario: Git 或 publication 检查本地数据库
- **WHEN** Git scope或遗留publication caller遇到`.buildr/local/workspace.sqlite*`
- **THEN** Buildr MUST将其保持为machine-local excluded data，且publication capability MUST不可路由
- **AND** MUST NOT stage、commit、push、声明portable owner或把数据库缺失解释为远端数据丢失

## ADDED Requirements

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
