# service 资产索引规范

## Purpose

定义全局服务（Service）的身份、代码库实例（Repository Instance）引用、项目关系与规则入口，并保留项目级 `service create` 命令及 v1/v2 清单的兼容接入和迁移边界。

全局模型使用根 `services/manifest.yml` 与 `repositories/manifest.yml`，项目通过 `serviceIds` 引用服务（Service）。下文 `service create <project>/<service>`、服务直接持有 `source` 及 v1 到 v2 收敛场景描述仍存在的项目级兼容入口；它们不要求全局服务复制 `source`、Git 来源或唯一 `projectId`，也不把旧项目内清单设为全局登记权威。

## Requirements

### Requirement: service create 支持本地路径和 Git URL
项目级兼容入口 MUST 使用 `service create` 命令将本地内容或Git URL物化为managed Service，或将用户明确选择的既有Git repository登记为Attached Root，并将结果写成项目级 v2 Service Domain；全局服务（Service）登记继续由全局关系能力维护。

#### Scenario: 接入本地路径
- **WHEN** Agent 调用 `buildr service create <project>/<service> <local-path>` without `--attach`
- **THEN** Buildr MUST 校验本地路径可访问性和 Git 仓库状态，将内容物化到 canonical managed Service path
- **AND** Buildr MUST NOT 在 Domain 中保存 workspace 外部来源路径

#### Scenario: 接入 Git URL
- **WHEN** Agent 调用 `buildr service create <project>/<service> <git-url>`
- **THEN** Buildr MUST clone 或幂等核对该 Git repo，并写入 managed Service source 声明

#### Scenario: 附接既有 Git Service
- **WHEN** Agent调用`buildr service create <project>/<service> --attach <absolute-path>`
- **THEN** Buildr MUST验证实际Git与声明identity并写入attached Service source
- **AND** MUST NOT复制、移动、修改或删除该repository内容

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
Buildr MUST 将服务作为工作空间全局业务实现对象，使用根 `services/manifest.yml` 保存稳定身份、名称、说明、类型、唯一代码库实例引用和可选模块路径；项目关系由项目清单维护。

#### Scenario: Service entity 字段完整
- **WHEN** 多个项目引用服务
- **THEN** 系统 MUST 返回同一服务标识，不要求唯一 projectId

#### Scenario: 文件系统定位
- **WHEN** 系统定位服务代码
- **THEN** MUST 解析被引用的代码库实例及可选模块路径，不从项目目录拼接代码位置

#### Scenario: 封闭 schema 与规则边界
- **WHEN** 用户维护服务规则
- **THEN** 系统 MUST 从服务资产目录发现 AGENTS.md，并保留代码目录实际适用规则

#### Scenario: Attached Root文件系统定位
- **WHEN** 服务引用的代码库是附接来源
- **THEN** 系统 MUST 解析明确登记的绝对位置，不复制或移动外部代码

#### Scenario: Git 来源
- **WHEN** 服务引用 Git 代码库实例
- **THEN** 系统 MUST 从实例读取地址、远端和集成分支，不在服务重复登记

#### Scenario: 父实体关联
- **WHEN** 项目引用全局服务
- **THEN** 系统 MUST 核对工作空间及稳定标识，不要求唯一父项目

#### Scenario: 空服务集合
- **WHEN** 项目没有关联服务
- **THEN** 系统 MUST 接受空引用集合且不创建项目内独占清单

### Requirement: service metadata 支持跨用户补全 repo
Buildr MUST 允许智能体（Agent）根据服务（Service）引用的代码库实例（Repository Instance）来源识别缺失代码，并引导用户决定是否克隆（Clone）或补全；项目级 v2 兼容入口继续从旧服务 `source` 读取同类来源事实。

#### Scenario: 共享 workspace 后缺失 service repo
- **WHEN** 新用户或另一个 Agent 打开共享的 Buildr workspace 且某个 metadata 声明的 Git service repo 不存在于本地
- **THEN** Buildr MUST 能提供足够信息让 Agent 询问用户是否自动 clone 该 repo

#### Scenario: 不要求用户手动查找 Git URL
- **WHEN** 服务（Service）引用的代码库实例（Repository Instance）或旧项目级服务清单已记录 Git URL
- **THEN** Agent MUST NOT 要求用户打开 Git 页面复制该 URL 才能补全 repo

### Requirement: 共享服务通过 Project 表达
Buildr MUST 允许服务独立存在并由多个项目引用，不再要求为共享服务创建占位项目。

#### Scenario: 用户未说明 service 归属
- **WHEN** 用户登记服务而未指定项目
- **THEN** 系统 MUST 允许有效全局登记，且可稍后建立项目引用

#### Scenario: 共享服务 metadata
- **WHEN** 多个项目使用同一服务
- **THEN** 服务 MUST 在全局清单登记一次，项目仅保存稳定引用

#### Scenario: 共享服务默认目录
- **WHEN** 创建服务资产目录
- **THEN** 系统 MUST 使用 `services/<code>`，实际代码由被引用代码库定位

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
Buildr MUST 只在最近parent Git repository确实包含managed nested Git Project/Service时维护ignore boundary，并 MUST不修改Attached Root或其外部parent的ignore配置。

#### Scenario: 独立 Project repo
- **WHEN** managed `<root>/projects/<project>/` is a Git repo and `<root>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure root `.gitignore` ignores `/projects/<project>/`

#### Scenario: 独立 Service repo under Git Project
- **WHEN** managed `<project-root>/services/<service>/` is a Git repo and `<project-root>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure Project `.gitignore` ignores `/services/<service>/`

#### Scenario: 独立 Service repo under non-Git Project
- **WHEN** managed Service Git repo的最近parent Git repository是Workspace root
- **THEN** Buildr create, update or sync MUST确保该parent忽略实际nested relative path

#### Scenario: Attached Root
- **WHEN** Project或Service source声明`root: attached`
- **THEN** Buildr MUST不写Workspace或外部parent `.gitignore`
- **AND** Doctor MUST按真实repository topology报告identity与ownership冲突

#### Scenario: Git boundary drift
- **WHEN** the nearest owning parent Git repo does not ignore a managed nested Git Project or Service repo
- **THEN** Buildr doctor MUST report a warning scoped to that repository action

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
Buildr MUST 将 Git 来源与集成分支归代码库实例维护，并将实际工作状态作为实时观察，通过服务引用提供。

#### Scenario: 读取 Git Service 详情
- **WHEN** 多个服务引用同一代码库实例
- **THEN** 系统 MUST 展示相同来源与集成基线，不复制独立可写 Git 声明

#### Scenario: 当前分支偏离 integration branch
- **WHEN** 当前代码目录分支与集成分支不同
- **THEN** 系统 MUST 展示差异，不自动切换、暂存、合并或丢弃内容

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
Buildr 产品项目（Product Project）MUST 在工作空间（Workspace）根的全局服务清单登记承载 Buildr 可执行产品的 `buildr` 服务（Service），并通过 `serviceIds` 引用其稳定身份。服务 MUST 使用 `repositoryId` 引用真实的共享代码库实例（Repository Instance），以 `modulePath: projects/product/services/buildr` 定位实现；代码来源 MUST 由该实例的 `source` 声明，不在持久化服务实体重复保存。登记 MUST 对应真实安装包及实现，不能为空壳、重复代码来源或仅供界面展示的替身（Fixture）。

#### Scenario: 读取 Product Service registry
- **WHEN** 命令行接口（CLI）、诊断（Doctor）或本机应用从全局关系视图读取产品项目（Product Project）引用的服务（Service）
- **THEN** 清单 MUST 返回 `code: buildr`、`type: application` 的服务（Service），名称与真实登记保持一致
- **AND** 服务 MUST 引用真实共享代码库实例（Repository Instance），其 `modulePath` 为 `projects/product/services/buildr`

#### Scenario: 定位 Buildr Service 资产
- **WHEN** 应用（Application）通过服务元信息（Service Metadata）定位 `product/buildr`
- **THEN** 系统 MUST 从代码库实例（Repository Instance）的 `source` 和服务（Service）的 `modulePath` 解析真实目录，该目录 MUST 包含 Buildr 安装包工程及服务级 `AGENTS.md`
- **AND** 产品项目（Product Project）根 MUST NOT 被声明为同一安装包的第二份权威实现来源

#### Scenario: 观察共享代码库的 Buildr Service
- **WHEN** Buildr 服务（Service）与产品项目（Product Project）使用同一实际 Git 代码库
- **THEN** 全局服务实体 MUST 保持代码库实例引用与模块路径，Git 来源和观察 MUST 属于被引用实例
- **AND** 页面与诊断（Doctor）MUST NOT 虚构独立服务的远端（Remote）、集成分支（Integration Branch）或 Git 状态

#### Scenario: 项目级兼容视图读取 Buildr Service
- **WHEN** 项目级兼容读者读取当前共享代码库中的 `product/buildr`，且代码库实例没有独立 `source.git` 地址声明
- **THEN** 兼容视图 MUST 从实例 `source` 与服务 `modulePath` 派生 `source.type: workspace` 及 `source.path: projects/product/services/buildr`
- **AND** 派生 `source` MUST NOT 被解释为全局服务的持久字段或另一份可写代码来源

### Requirement: Buildr 自举 Product 必须登记真实的 buildr-web Service
Buildr 产品项目（Product Project）MUST 通过 `serviceIds` 引用全局清单中承载 Buildr Web 前端工程的 `buildr-web` 服务（Service）。它 MUST 与 `buildr` 保持独立服务身份，通过相同的 `repositoryId` 引用实际共享代码库实例（Repository Instance），并以 `modulePath: projects/product/services/buildr-web` 定位真实前端工程。两个服务 MUST NOT 被登记为同一模块目录，不能使用空壳或仅供界面展示的替身（Fixture）；代码来源由被引用实例的 `source` 声明。

#### Scenario: 读取 Product Service registry 中的 buildr-web
- **WHEN** 命令行接口（CLI）、诊断（Doctor）或本机应用从全局关系视图读取产品项目（Product Project）引用的服务（Service）
- **THEN** 清单 MUST 返回 `code: buildr-web` 的服务（Service）
- **AND** 服务 MUST 通过代码库实例（Repository Instance）引用及 `modulePath: projects/product/services/buildr-web` 定位前端工程，不要求服务持久化 `source`

#### Scenario: buildr 与 buildr-web 路径不重叠
- **WHEN** 应用（Application）同时定位 `product/buildr` 与 `product/buildr-web`
- **THEN** 系统 MUST 从相同代码库实例（Repository Instance）的 `source` 与两个服务（Service）的模块路径分别解析到 `projects/product/services/buildr` 与 `projects/product/services/buildr-web`
- **AND** 产品项目（Product Project）根 MUST NOT 将二者声明为同一前端或安装包实现来源

#### Scenario: 项目级兼容视图读取 buildr-web
- **WHEN** 项目级兼容读者读取当前共享代码库中的 `product/buildr-web`，且代码库实例没有独立 `source.git` 地址声明
- **THEN** 兼容视图 MUST 从实例 `source` 与服务 `modulePath` 派生 `source.type: workspace` 及 `source.path: projects/product/services/buildr-web`
- **AND** 派生字段 MUST NOT 替代全局 `repositoryId`、`modulePath` 或被引用实例的真实来源
