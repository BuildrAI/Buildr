# project-registry Specification

## Purpose
定义 root Project registry 的结构、Project 创建与修复、Git 边界，以及从 `projects/` 目录事实收敛 registry 状态的行为。

## Requirements

### Requirement: root project registry
Buildr MUST 维护 root `projects/manifest.yml` registry，将 Workspace 发现与治理的 Projects 投影为存储无关 Project Domain；Project 可以位于默认 Managed Root 或用户明确登记的 Attached Root。

#### Scenario: 初始化空 registry
- **WHEN** Agent executes `buildr init --target <root>`
- **THEN** Buildr MUST create `<root>/projects/manifest.yml` with `schemaVersion: buildr.projects/v2` and an empty Project registry
- **AND** Buildr MUST create `<root>/projects/` even when no Project exists

#### Scenario: registry 记录完整 Project entity
- **WHEN** Buildr records Project `<project>` in canonical `projects/manifest.yml`
- **THEN** the Project MUST contain UUID `id`, UUID `workspaceId`, `code`, `name`, `description` and `source`
- **AND** `workspaceId` MUST equal the current Workspace identity
- **AND** the manifest map key MUST equal `code` but MUST NOT replace the domain field

#### Scenario: registry 记录 materialized path
- **WHEN** Project source 没有声明 `root` 或声明 `root: managed`
- **THEN** `source.path` MUST locate the Project as `projects/<code>` relative to the Workspace
- **AND** Buildr MUST NOT use an absolute or escaping managed path

#### Scenario: registry 记录 Attached Root
- **WHEN** Project source 声明 `root: attached`
- **THEN** `source.path` MUST 是用户明确选择的规范化绝对路径
- **AND** source MUST 为具有完整Git declaration的独立Git repository
- **AND** Buildr MUST NOT推导其内容ownership

#### Scenario: registry 使用封闭 schema
- **WHEN** Buildr writes Project metadata in `projects/manifest.yml`
- **THEN** the registry MUST limit Project data to the canonical Domain fields
- **AND** Project rules, memory, business facts, OpenSpec, Skills, capabilities, Commands, verification and service metadata MUST remain outside the Project entity
- **AND** Buildr update or sync MUST remove unknown Project registry fields only after a complete successful preflight

### Requirement: project create maintains registry
Buildr 在创建、修复或附接 Project asset root 时 MUST 通过 Project Application 更新 canonical Project Domain，并 MUST区分managed materialization与attached registration effects。

#### Scenario: 创建 workspace-managed Project
- **WHEN** Agent executes `buildr project create <code> --target <root>` without a repo URL or attachment
- **THEN** Buildr MUST create or repair `<root>/projects/<code>/` using the Project baseline
- **AND** Buildr MUST record a new UUID identity, current Workspace UUID, `code`, `name`, `description` and `source.type: workspace`
- **AND** `source.path` MUST be `projects/<code>` and source MUST project `root: managed`

#### Scenario: 创建 Git-managed Project
- **WHEN** Agent executes `buildr project create <code> --repo <git-url> --integration-branch <branch> --target <root>`
- **THEN** Buildr MUST materialize the Project asset repo at `<root>/projects/<code>/`
- **AND** Buildr MUST record `source.type: git`, managed path, URL, declared remote and declared integration branch
- **AND** if integration branch is omitted, Buildr MUST resolve and persist the remote default branch or fail without partial registry writes

#### Scenario: 附接既有 Git Project
- **WHEN** Agent executes `buildr project create <code> --attach <absolute-path> --target <root>`
- **THEN** Buildr MUST核对独立Git top-level、remote、URL、integration branch与既有Domain identity
- **AND** MUST记录`source.type: git`、`root: attached`与绝对path
- **AND** MUST NOT clone、copy、move、repair baseline或写Attached Root内容

#### Scenario: 创建 Project 时提供说明
- **WHEN** Agent executes `buildr project create <code> --name <name> --description <description> --target <root>`
- **THEN** Buildr MUST record the provided name and description
- **AND** Buildr MUST accept legacy `--title` as compatibility input but canonical help and output MUST use `--name`
- **AND** Buildr MUST NOT write the description into Project OpenSpec specs or knowledge as an authoritative project fact

#### Scenario: 既有目录由 project create 补登记
- **WHEN** Agent executes managed `buildr project create <code> --target <root>` and `<root>/projects/<code>/` already exists
- **THEN** Buildr MUST validate source identity before repairing baseline assets and updating the registry
- **AND** Buildr MUST preserve an existing canonical Project UUID
- **AND** Buildr MUST NOT overwrite existing Project files

### Requirement: Project repo boundaries
Buildr MUST 根据 ProjectSource 的真实 topology 与 ownership在root Workspace repo、独立managed Project repos和Attached Roots之间保持清晰Git边界。

#### Scenario: workspace source follows root Git
- **WHEN** a managed Project has `source.type: workspace`
- **THEN** Buildr MUST treat `source.path` as root Workspace assets
- **AND** Buildr MUST NOT add that path to root `.gitignore`

#### Scenario: Git source is ignored by root Git
- **WHEN** a managed Project has `source.type: git`
- **THEN** Buildr MUST ensure root `.gitignore` ignores `source.path`
- **AND** Buildr MUST NOT require the root Git repo to store the nested Project repo contents

#### Scenario: Attached Root不修改Workspace ignore
- **WHEN** a Project has `source.root: attached`
- **THEN** Buildr MUST按实际Git topology观察repository boundary
- **AND** MUST NOT向Workspace或Attached Root `.gitignore`写入由目录形状推导的规则

### Requirement: Project registry remains separate from service metadata
Buildr MUST 在项目清单保存 `serviceIds` 引用，全局服务与代码来源信息 MUST 分别位于 `services/manifest.yml` 和 `repositories/manifest.yml`，不在项目条目复制。

#### Scenario: Project registry 不记录 services
- **WHEN** 两个项目使用同一个服务
- **THEN** 两个项目 MUST 引用同一稳定标识，服务与代码信息仅登记一次

#### Scenario: service create 不改变 Project source
- **WHEN** 用户创建服务或修改项目的服务引用
- **THEN** 系统 MUST 保持项目自身 source 不变

### Requirement: MVP Project registry convergence
Buildr MUST 通过显式 update 或 sync 将 Project directory facts 与兼容 registry 收敛为 canonical `buildr.projects/v2`，普通读取与 app 启动 MUST 保持零写入。

#### Scenario: v1 registry compatibility read
- **WHEN** Buildr reads a valid `buildr.projects/v1` registry
- **THEN** Buildr MUST project key, `title`, `description`, `path` and `repo` into the v2 Domain view
- **AND** `repo.defaultBranch` MUST map to `source.git.integrationBranch`
- **AND** the result MUST report `migrationRequired: true` without modifying files

#### Scenario: v1 registry explicit migration
- **WHEN** Agent runs canonical update or sync for a Workspace with a valid v1 registry
- **THEN** Buildr MUST preflight all entries, generate one UUID per Project, copy the current Workspace UUID and atomically write v2
- **AND** a failed preflight MUST leave the v1 bytes unchanged
- **AND** a repeated update or sync MUST preserve generated identities

#### Scenario: 从 Project 目录补登记
- **WHEN** `<root>/projects/<code>/` is a valid Project directory but canonical registry does not declare `<code>`
- **THEN** Buildr update or sync MUST add a complete Project entity
- **AND** Buildr MUST infer source type from the actual repository boundary and resolve required Git declaration fields before writing

#### Scenario: Project registry drift
- **WHEN** the registry contains invalid identity, workspace association, code/key mismatch, unsafe path, missing required fields, unknown fields or incomplete description
- **THEN** doctor MUST report a stable warning or error with migration/repair next action
- **AND** Buildr MUST NOT silently repair the registry during ordinary read or app startup

### Requirement: Project create 验证既有 repo identity
Buildr MUST 在修复既有 Project baseline 或 registry 前验证 materialized Project 的实际 source identity 与命令和 Domain 声明一致。

#### Scenario: 相同 Git 来源幂等修复
- **WHEN** `project create --repo <git-url>` 的目标已是 Git repo，且实际 declared remote URL、命令 URL 和既有 Project source identity 一致
- **THEN** Buildr MUST allow repair of missing baseline and low-risk metadata
- **AND** Buildr MUST preserve Project `id`, `workspaceId`, `code`, path and source identity

#### Scenario: 既有 Project 来源冲突
- **WHEN** target repo remote, command URL, source type, declared URL or path conflict
- **THEN** Buildr MUST fail before any Project, registry or `.gitignore` write
- **AND** Buildr MUST NOT silently relink, replace or rewrite source identity

#### Scenario: 新 Git Project clone 失败
- **WHEN** a new Project clone or subsequent baseline preflight fails
- **THEN** Buildr MUST NOT leave a partial Project directory or registry entry

### Requirement: Project registry 识别 Command requirement context
Buildr MUST 将已登记 Project 的 `commands.yml` 识别为 Project context asset，并 MUST 验证其与 workspace Command catalog 的引用完整性。

#### Scenario: Project create 生成 Command context
- **WHEN** Buildr 成功创建一个 Project
- **THEN** Project baseline MUST 包含 `commands.yml`
- **AND** Project registry 与 doctor MUST 将其报告为已初始化 Project asset

#### Scenario: Project requirement 不影响 repo ownership
- **WHEN** Project 使用 workspace repo 或独立 asset repo
- **THEN** `commands.yml` MUST 跟随 Project asset ownership
- **AND** workspace Command catalog MUST 继续跟随 workspace root ownership

#### Scenario: 未登记目录不参与 requirements
- **WHEN** `projects/` 下存在未登记目录及其 `commands.yml`
- **THEN** Buildr MUST NOT 将其 requirements 纳入有效 task context
- **AND** doctor MAY 报告未登记目录，但 MUST 避免派生 machine readiness 噪音

### Requirement: Project registry 识别可选测试能力声明
Buildr MUST 将已登记 Project 的 `verification.yml` 识别为 Project context asset，并 MUST 保持该资产可选、跟随 Project ownership 且独立于技能配置。

#### Scenario: Project 没有测试声明
- **WHEN** Buildr 创建 Project 或诊断没有 `verification.yml` 的既有 Project
- **THEN** Project MUST 保持有效且默认 baseline MUST NOT 强制生成空声明
- **AND** Buildr MUST NOT 因缺失声明改变 `commands.yml` 或 Service registry

#### Scenario: Project 初始化测试声明
- **WHEN** Agent 经用户意图在已登记 Project 中创建 `verification.yml`
- **THEN** 声明 MUST 跟随该 Project 的实际 asset repo ownership
- **AND** workspace runtime render MUST NOT 把声明复制为 Skill source 或 Service repo 文件

#### Scenario: 未登记目录包含测试声明
- **WHEN** `projects/` 下未登记目录包含 `verification.yml`
- **THEN** Buildr MUST NOT 将其能力纳入有效 Project task context
- **AND** doctor MAY 报告未登记目录，但 MUST NOT 执行声明中的测试命令

### Requirement: Project Git 声明与观察必须分离
Buildr MUST 将稳定 Git source 声明保存在 Project Domain，并通过 Git adapter 实时观察工作状态。

#### Scenario: 查询 Git Project 实际状态
- **WHEN** Application reads a Git Project detail
- **THEN** it MUST query repository presence, current branch, HEAD, dirty state, upstream, ahead/behind and declared remote actual URL
- **AND** it MUST NOT persist those observed fields in `projects/manifest.yml`

#### Scenario: 当前分支偏离 integration branch
- **WHEN** observed current branch differs from declared `integrationBranch`
- **THEN** doctor and UI MUST expose the drift as an explainable diagnostic
- **AND** Buildr MUST NOT automatically checkout, stash, merge or discard changes

#### Scenario: remote identity conflict
- **WHEN** the declared remote is missing or its actual URL conflicts with `source.git.url`
- **THEN** doctor MUST report an error with declared and observed identity
- **AND** Project mutations that depend on source identity MUST fail closed

#### Scenario: workspace Project follows root state
- **WHEN** a Project uses `source.type: workspace`
- **THEN** Buildr MUST NOT require a Project-level `integrationBranch`
- **AND** root checkout branch policy MUST remain a Workspace/task-finish concern

### Requirement: Project metadata update 必须受控并防止覆盖
Project Application MUST only allow low-risk metadata updates using a registry revision compare-and-swap.

#### Scenario: 修改 Project name 与 description
- **WHEN** caller submits `name` or `description` with the current registry revision
- **THEN** Application MUST validate the Domain, atomically update the current canonical manifest and return the new revision；已使用全局模型的项目 MUST 保留 `serviceIds` 与 `buildr.projects/v3`，旧 v2 清单继续按兼容边界维护
- **AND** all other Project entries and fields MUST remain unchanged

#### Scenario: 拒绝 identity 或 source 修改
- **WHEN** caller submits `id`, `workspaceId`, `code`, `source`, path, Git declaration or unknown fields
- **THEN** Application MUST reject the whole mutation before write

#### Scenario: registry revision 冲突
- **WHEN** the supplied revision differs from actual manifest bytes
- **THEN** Application MUST return a stable conflict result
- **AND** MUST NOT merge or overwrite external changes

### Requirement: 新建 Project 必须初始化 canonical Service registry
新建项目 MUST 使用全局服务清单并保存空或明确选择的 `serviceIds`，不再创建项目内的独占服务清单。

#### Scenario: 创建 Workspace Project
- **WHEN** 用户创建项目且未选择服务
- **THEN** 系统 MUST 创建有效项目并允许稍后维护关联

#### Scenario: Project 创建回滚
- **WHEN** 项目及其新增服务或代码库草稿任一步验证失败
- **THEN** 系统 MUST 保持提交前登记状态，不留下半完成引用

### Requirement: Project context必须识别Preparation Declaration
Buildr MUST将已登记Project根的`preparation.yml`识别为可选Project context asset，保持Project ownership并独立于`commands.yml`和`verification.yml`。Project create、sync、Doctor或GET MUST不静默生成或更新该声明。

#### Scenario: Project没有Preparation Declaration
- **WHEN** 创建或诊断一个没有`preparation.yml`的Project
- **THEN** Project registry MUST保持有效
- **AND** Buildr MUST不根据Service目录内容自动写入声明

#### Scenario: 未登记Project目录包含声明
- **WHEN** `projects/`下未登记目录包含`preparation.yml`
- **THEN** Buildr MUST不把它当作已登记Project声明执行
- **AND** Doctor MAY按现有未登记资产政策报告目录事实

### Requirement: Project与Service注册必须触发声明核对提示
Project或Service成功注册后，Buildr MUST向Agent提供对应scope的声明核对 next action，准备声明由 `buildr` 指引维护，测试登记由 `project-testing` 维护。该提示 MUST只启动只读发现，注册事务 MUST不创建或修改`preparation.yml`或`verification.yml`。

#### Scenario: 注册Project
- **WHEN** `project create`成功完成Project与registry写入
- **THEN**结果 MUST提示检查Project Preparation与Verification声明
- **AND**缺失声明 MUST不使Project注册失败

#### Scenario: 注册Service
- **WHEN** `service create`成功完成Service与registry写入
- **THEN**结果 MUST提示只读刷新所属Project及该Service的声明候选
- **AND** MUST不静默把Service加入任一声明

### Requirement: 项目能力上下文退役并保全旧配置
Buildr MUST NOT 创建、修复或要求项目 `capabilities.yml`，MUST 保留非空需求/绑定、异常、未知字段与不安全文件且不自动迁移配置；同步 MUST 自动清理只有空需求/绑定及技能名单的安全旧文件。

#### Scenario: 新建或修复项目
- **WHEN** 创建、同步或修复一个项目
- **THEN** Buildr MUST NOT 生成 `capabilities.yml`
- **AND** 缺少此文件 MUST NOT 产生项目基线缺失诊断

#### Scenario: 已登记项目保留旧文件
- **WHEN** Doctor 发现旧 `capabilities.yml`
- **THEN** MUST 提示文件已退役且不参与能力选择
- **AND** 非空 requires/bindings 或不能安全识别的内容 MUST 给出 warning 和具体核对指引
- **AND** 只有技能名单或空字段 MUST 仅给出 info；MUST NOT 校验名单中的过期技能 ID
- **AND** Doctor MUST NOT 修改文件或自动创建工作空间绑定；同步只按安全预检执行清理

#### Scenario: 同步安全清理与版本保护
- **WHEN** 已登记且归属当前工作空间的项目旧文件为可安全识别的普通文件，只有空 requires/bindings 和技能 ID 名单
- **THEN** 同步 MUST 在既有事务内自动删除并报告准确路径，重复同步 MUST 不重复删除
- **AND** 删除前 MUST 复核观察到的文件身份与内容，变化时 MUST 保留新内容并停止对应写入
- **AND** 非空需求/绑定、未知字段、格式异常、符号链接、未登记目录和外部附加根 MUST NOT 被自动删除
- **AND** 同步后续失败时 MUST 按既有事务恢复已删除文件
