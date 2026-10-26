## MODIFIED Requirements

### Requirement: Workspace 本地结构化存储必须是单机且不参与同步
Buildr MUST 为每个 Workspace root 使用该 root 唯一的 `.buildr/local/workspace.sqlite` 作为 Workspace 本地结构化存储，并 MUST 将数据库、WAL/SHM sidecar 和 `.buildr/local/` 中的运行状态排除在 Git、Work Asset 与跨机器同步之外。canonical、candidate 和 validation Workspace MUST 各自使用自身 root 的 store，任何 store MUST NOT 被描述为 Buildr Server、Buildr Cloud 或组织协作 authority，Task current records MUST NOT 通过 Git 或本地数据库同步进行分享。

本规范的数据库、结构迁移（Schema Migration）及工作空间写入者（Workspace Writer）条款 MUST 约束工作空间结构化存储（Workspace Structured Store），不将应用配置域（Profile）的私有智能体交互库视作第二个工作空间数据库。新私有交互库 MUST 位于已解析应用配置域（Profile）的 `dataRoot/agent-service/conversations.sqlite`，只保存连接索引、统一可见对话及内部关系、执行和交付尝试等交互事实；任务（Task）、工作台（Workbench）及工作资产（Work Asset）的权威数据 MUST 留在原位置。该库 MUST 不迁移、复制或双写工作空间权威事实，不参与 Git 或跨机器同步，其迁移版本及诊断 MUST 与工作空间数据库分离。

#### Scenario: 首个结构化 writer 创建数据库
- **WHEN** 某 Workspace root 中尚无本地数据库，且合法结构化 writer 执行首次 mutation
- **THEN** Buildr MUST 只在该 Workspace root 的 `.buildr/local/` 创建数据库并完成 current schema 初始化
- **AND** 该 Workspace writer MUST NOT 创建用户级全局数据库、远程连接、同步记录或 Git publication path

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

#### Scenario: 创建应用配置域私有交互库
- **WHEN** 用户通过新接入创建内部对话（Conversation）且本应用配置域（Profile）尚无私有交互库
- **THEN** 新能力 MUST 只初始化该配置域私有交互存储，任务引用仍指向准确工作空间（Workspace）与任务（Task）身份
- **AND** MUST NOT 修改工作空间数据库、创建另一套任务状态或导入外部桌面历史

#### Scenario: 私有交互库读取或升级异常
- **WHEN** 只读访问发现私有交互库尚不存在、版本较新、损坏或需要迁移
- **THEN** 系统 MUST 返回准确空状态或局部诊断，不能由只读动作创建数据库、迁移或删除原数据
- **AND** 合法写入需要升级时 MUST 只原子演进该库自己的版本，不应用工作空间迁移脚本
- **AND** 该库的局部失败 MUST 不阻止旧接入和原工作空间数据库的无关安全操作

#### Scenario: 预览私有交互数据隔离
- **WHEN** 候选或预览环境验证新的账号及对话能力
- **THEN** 私有交互库、厂家配置及必要图片 MUST 使用该环境独立数据根
- **AND** MUST NOT 复用或回灌正式版、开发版日常实例的私有交互库，也不改变原工作空间写入者来源校验
