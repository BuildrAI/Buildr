## MODIFIED Requirements

### Requirement: Workspace 本地结构化存储必须是单机且不参与同步
Buildr MUST 为每个 Workspace root 使用该 root 唯一的 `.buildr/local/workspace.sqlite` 作为 Workspace 本地结构化存储，并 MUST 将数据库、WAL/SHM sidecar 和 `.buildr/local/` 中的运行状态排除在 Git、Work Asset 与跨机器同步之外。canonical、candidate 和 validation Workspace MUST 各自使用自身 root 的 store，任何 store MUST NOT 被描述为 Buildr Server、Buildr Cloud 或组织协作 authority，Task current records MUST NOT 通过 Git 或本地数据库同步进行分享。

#### Scenario: 首个结构化 writer 创建数据库
- **WHEN** 某 Workspace root 中尚无本地数据库，且合法结构化 writer 执行首次 mutation
- **THEN** Buildr MUST 只在该 Workspace root 的 `.buildr/local/` 创建数据库并完成 current schema 初始化
- **AND** MUST NOT 创建用户级全局数据库、远程连接、同步记录或 Git publication path

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
