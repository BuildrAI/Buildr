# service 资产索引规范

## Purpose

定义 Buildr MVP 中 service create、service metadata、共享/基础服务 Project、服务语义和规则入口的资产索引行为。
## Requirements

### Requirement: service create 支持本地路径和 Git URL
Buildr MUST 使用一个 `service create` 命令接入本地路径或 Git URL，并将结果写成 canonical Service Domain。

#### Scenario: 接入本地路径
- **WHEN** Agent 调用 `buildr service create <project>/<service> <local-path>`
- **THEN** Buildr MUST 校验本地路径可访问性和 Git 仓库状态，将内容物化到 canonical Service path
- **AND** Buildr MUST NOT 在 Domain 中保存 workspace 外部来源路径

#### Scenario: 接入 Git URL
- **WHEN** Agent 调用 `buildr service create <project>/<service> <git-url>`
- **THEN** Buildr MUST clone 或幂等核对该 Git repo，并写入 Service source 声明

### Requirement: Git URL 默认使用远端 HEAD
Buildr MUST 在 Git URL 未指定 integration branch 时使用远端 HEAD 作为 clone 目标和稳定 integration branch 声明。

#### Scenario: 用户未指定分支
- **WHEN** `service create` 接收到 Git URL 且用户没有指定 `--integration-branch` 或兼容 `--branch`
- **THEN** Buildr MUST 解析远端 HEAD 对应分支完成 clone
- **AND** Buildr MUST 将该分支记录为 `source.git.integrationBranch`

#### Scenario: 用户指定分支
- **WHEN** 用户或 Agent 明确指定 integration branch
- **THEN** Buildr MUST 使用指定分支完成 clone 或核对既有 checkout
- **AND** Buildr MUST 将其作为稳定声明而非当前分支快照

### Requirement: service metadata 作为最小服务资产索引
Buildr MUST 使用项目级 `services/manifest.yml` 作为 Service Domain 的文件系统投影，并以 `buildr.services/v2` 作为 canonical schema。

#### Scenario: Service entity 字段完整
- **WHEN** Buildr 写入 canonical Service entry
- **THEN** entry MUST 包含 UUID `id`、`workspaceId`、`projectId`、`code`、`name`、`description`、`type` 与 `source`
- **AND** manifest map key MUST 等于 `code`

#### Scenario: 文件系统定位
- **WHEN** Service 通过文件系统 repository 持久化
- **THEN** `source.path` MUST 等于 `projects/<projectCode>/services/<serviceCode>`
- **AND** Application MUST 能通过该 path 定位实际资产

#### Scenario: Git 来源
- **WHEN** Service source 类型是 Git
- **THEN** source MUST 记录 `url`、`remote` 和 `integrationBranch`
- **AND** current branch、HEAD、dirty、upstream、ahead 与 behind MUST NOT 写入 Domain

#### Scenario: 父实体关联
- **WHEN** repository 读取 Project 下的 Service registry
- **THEN** 每个 Service 的 `workspaceId` 与 `projectId` MUST 分别匹配当前 Workspace 与 Project
- **AND** 顶层 `projectId` MUST 匹配当前 Project

#### Scenario: 空服务集合
- **WHEN** Project 没有 Service
- **THEN** Buildr MUST 保留 canonical 空 Service registry 和 Service collection directory

#### Scenario: 封闭 schema 与规则边界
- **WHEN** Buildr 写入 Service metadata
- **THEN** repository MUST 移除未知字段
- **AND** Service Rules MUST 继续从 Service 目录的 `AGENTS.md` 发现，不得写入 registry

### Requirement: service metadata 支持跨用户补全 repo
Buildr MVP MUST 允许 Agent 根据 service metadata 识别缺失 service repo，并引导用户决定是否自动 clone 或补全。

#### Scenario: 共享 workspace 后缺失 service repo
- **WHEN** 新用户或另一个 Agent 打开共享的 Buildr workspace 且某个 metadata 声明的 Git service repo 不存在于本地
- **THEN** Buildr MUST 能提供足够信息让 Agent 询问用户是否自动 clone 该 repo

#### Scenario: 不要求用户手动查找 Git URL
- **WHEN** service metadata 已记录 Git URL
- **THEN** Agent MUST NOT 要求用户打开 Git 页面复制该 URL 才能补全 repo

### Requirement: 共享服务通过 Project 表达
Buildr MVP MUST 使用普通 Project 表达共享、基础或平台服务，不得使用 root `shared/` 作为默认 service 命名空间。

#### Scenario: 用户未说明 service 归属
- **WHEN** 用户要求 Agent 接入 service repo 但没有说明它属于哪个项目或共享服务集合
- **THEN** Agent MUST 引导用户选择或创建一个 Project，例如 `foundation`、`platform` 或用户指定名称

#### Scenario: 共享服务 metadata
- **WHEN** service 归属共享、基础或平台服务集合
- **THEN** Buildr MUST 使用 `projects/<project>/services/manifest.yml` 维护 service metadata

#### Scenario: 共享服务默认目录
- **WHEN** Buildr 管理共享、基础或平台 service repo
- **THEN** Buildr MUST 使用 `projects/<project>/services/<service>/` 作为默认 service repo 目录

### Requirement: service metadata 表达服务语义和规则入口
Buildr MVP MUST allow service metadata to record Service type, while Service-level Rules MUST be discovered from the Service directory's `AGENTS.md` convention rather than from a rule-source pointer in metadata.

#### Scenario: 记录服务类型
- **WHEN** Agent 或用户指定 Service 类型
- **THEN** Buildr MUST 能在 Service metadata 中记录 backend、frontend、mobile、library 或 infra 等服务语义

#### Scenario: Service 规则入口使用目录约定
- **WHEN** `projects/<project>/services/<service>/AGENTS.md` 存在
- **THEN** Buildr MUST treat that file as the Service-level rule source
- **AND** runtime adapters MUST discover it through canonical scope and recursive `AGENTS.md` projection
- **AND** `services/manifest.yml` MUST NOT record `rules.source`、`rules` or an equivalent rule-source pointer

#### Scenario: Service manifest 保持封闭 schema
- **WHEN** Buildr creates、updates or migrates `services/manifest.yml`
- **THEN** Buildr MUST keep Service rule-source fields outside the manifest schema
- **AND** Buildr MUST NOT migrate legacy `rules.source` into the manifest

#### Scenario: 不记录 Service repo runtime 投射意图
- **WHEN** Buildr 写入 Service metadata
- **THEN** Service metadata MUST NOT 要求或默认记录向 Service repo 投射 Agent runtime 的意图

### Requirement: legacy service metadata convergence
Buildr MUST 兼容读取旧 `services.yml` 与 `buildr.services/v1`，并只在显式 update/sync 中收敛为 `buildr.services/v2`。

#### Scenario: 普通读取旧 registry
- **WHEN** CLI、doctor 或 app 读取 legacy Service metadata
- **THEN** Buildr MUST 产生不写盘的兼容 Domain projection
- **AND** MUST 返回 `migrationRequired` 与明确 next action

#### Scenario: 显式迁移 v1
- **WHEN** Agent 运行 canonical update/sync 且 v1 registry 通过预检
- **THEN** Buildr MUST 从 Workspace 与 Project 获取父 UUID，为每个 Service 生成 UUID 并原子写入 v2
- **AND** v1 `title` MUST 迁移为 `name`
- **AND** v1 `repo.branch` MUST 优先迁移为 `source.git.integrationBranch`，缺失时回退到 `repo.defaultBranch`

#### Scenario: 旧 services.yml 与 manifest 同时存在
- **WHEN** 两者同时存在
- **THEN** `services/manifest.yml` MUST 是 source of truth
- **AND** 显式收敛 MUST 删除旧 `services.yml`

#### Scenario: 迁移失败
- **WHEN** 任一父关联、Git identity 或字段校验失败
- **THEN** Buildr MUST 保持 registry、Service 文件和 Git boundary 零写入

### Requirement: Git boundary maintenance for managed repos
Buildr MUST 在最近的 parent Git repository 中维护 nested Git Project 与 Service repos 的 ignore boundaries。

#### Scenario: 独立 Project repo
- **WHEN** `<root>/projects/<project>/` is a Git repo and `<root>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure root `.gitignore` ignores `/projects/<project>/`

#### Scenario: 独立 Service repo under Git Project
- **WHEN** `<root>/projects/<project>/services/<service>/` is a Git repo and `<root>/projects/<project>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure Project `.gitignore` ignores `/services/<service>/`

#### Scenario: 独立 Service repo under non-Git Project
- **WHEN** `<root>/projects/<project>/services/<service>/` is a Git repo, `<root>/projects/<project>/` is not a Git repo and `<root>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure root `.gitignore` ignores `/projects/<project>/services/<service>/`

#### Scenario: Git boundary drift
- **WHEN** the nearest parent Git repo does not ignore a nested Git Project or Service repo
- **THEN** Buildr doctor MUST report a warning

### Requirement: service create 验证既有 repo identity
Buildr MUST 在写入 Service metadata 前验证 materialized Service repo 的实际 identity 与命令和既有 metadata 一致。

#### Scenario: 相同 Git 来源重复创建
- **WHEN** `service create <project>/<service> <git-url>` 的目标已是 Git repo，且实际 remote、命令 URL 和 metadata identity 一致
- **THEN** Buildr MUST 允许幂等修复 metadata 和 Git boundary
- **AND** Buildr MUST NOT 重新 clone 或覆盖 Service 文件

#### Scenario: 既有 Service Git 来源冲突
- **WHEN** 目标 remote、命令 Git URL 或既有 metadata URL 不一致
- **THEN** Buildr MUST 在 metadata 和 `.gitignore` 写入前失败
- **AND** Buildr MUST 报告实际与期望来源并要求显式解决

#### Scenario: 本地来源目标已存在
- **WHEN** `service create` 使用本地路径且目标 Service 目录已存在
- **THEN** Buildr MUST 保持既有拒绝语义
- **AND** Buildr MUST NOT 删除、合并或覆盖目标目录

#### Scenario: 新 Service materialization 失败
- **WHEN** clone、copy 或 source transaction 任一步骤失败
- **THEN** Buildr MUST NOT 留下半完成 Service 目录、metadata entry 或 Git boundary 变更

### Requirement: Service Git 声明与观察必须分离
Buildr MUST 从 Service Domain 的稳定 Git 声明生成实时 observed view，不得把观察结果持久化回 Domain。

#### Scenario: 读取 Git Service 详情
- **WHEN** Application 读取 Git Service 详情
- **THEN** 返回值 MUST 分离 `service.source.git` 与 `observed`
- **AND** MUST 对 remote identity、current branch、dirty 与 upstream drift 生成结构化 comparison

#### Scenario: 当前分支偏离 integration branch
- **WHEN** 当前分支不同于 `source.git.integrationBranch`
- **THEN** doctor 和 UI MUST 展示可解释诊断
- **AND** Buildr MUST NOT 自动 checkout、stash、merge 或 rebase

### Requirement: Service metadata update 必须受控并防止覆盖
Buildr MUST 只允许通过 Application 修改 Service 的 `name`、`description` 和 `type`，并使用 registry revision 防止覆盖外部变化。

#### Scenario: 修改允许字段
- **WHEN** 请求携带当前 revision 并修改允许字段
- **THEN** Buildr MUST 原子写入 canonical registry 并返回新 revision

#### Scenario: revision 已变化
- **WHEN** 请求 revision 不等于当前文件 revision
- **THEN** Buildr MUST 返回 conflict 且零写入

#### Scenario: 修改稳定身份或 source
- **WHEN** 请求尝试修改 id、父 UUID、code、source 或 path
- **THEN** Buildr MUST 拒绝整次请求

### Requirement: Buildr 自举 Product 必须登记真实 application Service
Buildr Product Project MUST 在 canonical Service registry 中登记承载 Buildr 可执行产品的 `buildr` Service，并 MUST 使用真实 workspace source path，而不是空壳、重复路径或只为界面展示生成的 fixture。

#### Scenario: 读取 Product Service registry
- **WHEN** CLI、doctor 或本机应用读取 Product Project 的 Service collection
- **THEN** registry MUST 返回 code 为 `buildr`、名称为“Buildr”、type 为 `application` 的 Service
- **AND** Service `source.path` MUST 等于 `projects/product/services/buildr`

#### Scenario: 定位 Buildr Service 资产
- **WHEN** Application 通过 Service metadata 定位 `product/buildr`
- **THEN** 对应目录 MUST 存在并包含真实 Buildr package 与 Service `AGENTS.md`
- **AND** Project root 与 Service root MUST NOT 声明重叠 source path

#### Scenario: 观察 workspace-source Buildr Service
- **WHEN** Buildr Service 与 Product Project 使用同一上级 Git workspace
- **THEN** Service Domain MUST 保持 `source.type: workspace`
- **AND** 页面与 doctor MUST NOT 虚构独立 remote、integration branch 或 Service Git 状态

### Requirement: Buildr 自举 Product 必须登记真实的 buildr-web Service
Buildr Product Project MUST 在 canonical Service registry 中登记承载 Local App 前端工程的 `buildr-web` Service，并 MUST 使用真实 workspace source path `projects/product/services/buildr-web`，而不是空壳、重复路径或只为界面展示生成的 fixture。`buildr-web` MUST 与 `buildr` 并列存在，且二者的 `source.path` MUST NOT 重叠。

#### Scenario: 读取 Product Service registry 中的 buildr-web
- **WHEN** CLI、doctor 或本机应用读取 Product Project 的 Service collection
- **THEN** registry MUST 返回 code 为 `buildr-web` 的 Service
- **AND** Service `source.path` MUST 等于 `projects/product/services/buildr-web`
- **AND** Service `source.type` MUST 为 `workspace`

#### Scenario: buildr 与 buildr-web 路径不重叠
- **WHEN** Application 同时定位 `product/buildr` 与 `product/buildr-web`
- **THEN** 两个 Service 的 `source.path` MUST 分别为 `projects/product/services/buildr` 与 `projects/product/services/buildr-web`
- **AND** Project root MUST NOT 将二者声明为同一 source path
