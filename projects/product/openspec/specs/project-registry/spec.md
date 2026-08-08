# project-registry Specification

## Purpose
定义 root Project registry 的结构、Project 创建与修复、Git 边界，以及从 `projects/` 目录事实收敛 registry 状态的行为。
## Requirements

### Requirement: root project registry
Buildr MUST 维护 root `projects/manifest.yml` registry，将由 Workspace 管理的 Projects 投影为存储无关 Project Domain。

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
- **WHEN** Buildr records Project `<project>` in `projects/manifest.yml`
- **THEN** `source.path` MUST locate the Project as `projects/<code>` relative to the Workspace
- **AND** Buildr MUST NOT use an absolute or escaping path

#### Scenario: registry 使用封闭 schema
- **WHEN** Buildr writes Project metadata in `projects/manifest.yml`
- **THEN** the registry MUST limit Project data to the canonical Domain fields
- **AND** Project rules, memory, business facts, OpenSpec, Skills, capabilities, Commands, verification and service metadata MUST remain outside the Project entity
- **AND** Buildr update or sync MUST remove unknown Project registry fields only after a complete successful preflight

### Requirement: project create maintains registry
Buildr 在创建或修复 Project asset root 时 MUST 通过 Project Application 更新 canonical Project Domain。

#### Scenario: 创建 workspace-managed Project
- **WHEN** Agent executes `buildr project create <code> --target <root>` without a repo URL
- **THEN** Buildr MUST create or repair `<root>/projects/<code>/` using the Project baseline
- **AND** Buildr MUST record a new UUID identity, current Workspace UUID, `code`, `name`, `description` and `source.type: workspace`
- **AND** `source.path` MUST be `projects/<code>`

#### Scenario: 创建 Git-managed Project
- **WHEN** Agent executes `buildr project create <code> --repo <git-url> --integration-branch <branch> --target <root>`
- **THEN** Buildr MUST materialize the Project asset repo at `<root>/projects/<code>/`
- **AND** Buildr MUST record `source.type: git`, path, URL, declared remote and declared integration branch
- **AND** if integration branch is omitted, Buildr MUST resolve and persist the remote default branch or fail without partial registry writes

#### Scenario: 创建 Project 时提供说明
- **WHEN** Agent executes `buildr project create <code> --name <name> --description <description> --target <root>`
- **THEN** Buildr MUST record the provided name and description
- **AND** Buildr MUST accept legacy `--title` as compatibility input but canonical help and output MUST use `--name`
- **AND** Buildr MUST NOT write the description into Project OpenSpec specs or knowledge as an authoritative project fact

#### Scenario: 既有目录由 project create 补登记
- **WHEN** Agent executes `buildr project create <code> --target <root>` and `<root>/projects/<code>/` already exists
- **THEN** Buildr MUST validate source identity before repairing baseline assets and updating the registry
- **AND** Buildr MUST preserve an existing canonical Project UUID
- **AND** Buildr MUST NOT overwrite existing Project files

### Requirement: Project repo boundaries
Buildr MUST 根据 ProjectSource 在 root Workspace repo 与独立 Project asset repos 之间保持清晰的 Git ownership boundaries。

#### Scenario: workspace source follows root Git
- **WHEN** a Project has `source.type: workspace`
- **THEN** Buildr MUST treat `source.path` as root Workspace assets
- **AND** Buildr MUST NOT add that path to root `.gitignore`

#### Scenario: Git source is ignored by root Git
- **WHEN** a Project has `source.type: git`
- **THEN** Buildr MUST ensure root `.gitignore` ignores `source.path`
- **AND** Buildr MUST NOT require the root Git repo to store the nested Project repo contents

### Requirement: Project registry remains separate from service metadata
Buildr MUST 将 Project registry metadata 与 service repo metadata 保存在独立 manifest files 中。

#### Scenario: Project registry 不记录 services
- **WHEN** Buildr records Project `<project>` in `projects/manifest.yml`
- **THEN** `projects/manifest.yml` MUST NOT record that Project's service repo list
- **AND** service repo metadata MUST remain in `projects/<project>/services/manifest.yml`

#### Scenario: service create 不改变 Project source
- **WHEN** Agent executes `buildr service create <project>/<service> <repo-ref> --target <root>`
- **THEN** Buildr MUST update `projects/<project>/services/manifest.yml`
- **AND** Buildr MUST NOT change the Project entity's `source`

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

### Requirement: Project 只引用 workspace 能力资产
Buildr MUST 允许 Project 声明对 workspace Skill 和 capability 的逻辑引用，并 MUST NOT 将这些引用解释为 Skill 安装、发现或访问隔离范围。

#### Scenario: Project 声明 capability requirement
- **WHEN** Project 声明一个 required 或 optional capability
- **THEN** Buildr MUST 将该声明解析到 workspace `skills/manifest.yml` 中的 contract 和 providers
- **AND** Project MUST NOT 内嵌或复制 provider Skill 内容

#### Scenario: Project 声明 Skill applicability
- **WHEN** Project 将一个 workspace Skill 标记为适用于自身业务任务
- **THEN** Buildr MUST 将该信息用于 Agent 路由提示和 doctor readiness 检查
- **AND** Buildr MUST NOT 将 applicability 描述为 Agent runtime 可见性限制

#### Scenario: Project 引用不存在的 workspace Skill
- **WHEN** Project 引用的 Skill ID 或 capability identity 无法从 workspace registry 解析
- **THEN** doctor MUST 报告 error、Project、缺失 identity 和可执行 nextActions
- **AND** Buildr MUST NOT 从 Project 目录猜测或生成 Skill 源

### Requirement: Project capability context 保持跨 Project 确定性
Buildr MUST 使用明确的 Project task context 解析 Project binding，并 MUST 在跨 Project 绑定不一致时 fail closed。

#### Scenario: 单 Project task 使用 Project binding
- **WHEN** 当前任务明确属于一个 Project 且该 Project 为 capability 声明 binding
- **THEN** Buildr MUST 使用该 binding 选择 workspace provider
- **AND** 该选择 MUST NOT 改变 provider 的 runtime 可见范围

#### Scenario: 跨 Project binding 冲突
- **WHEN** 当前任务涉及多个 Project 且它们为同一 capability 选择不同 providers
- **THEN** Buildr MUST 报告 `cross_project_binding_ambiguous`
- **AND** Agent MUST 拆分 Project 动作或取得明确选择，不得依据当前目录或 Project 顺序猜测

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
Buildr MUST 将已登记 Project 的 `verification.yml` 识别为 Project context asset，并 MUST 保持该资产可选、跟随 Project ownership 且独立于 Skill capability context。

#### Scenario: Project 没有测试声明
- **WHEN** Buildr 创建 Project 或诊断没有 `verification.yml` 的既有 Project
- **THEN** Project MUST 保持有效且默认 baseline MUST NOT 强制生成空声明
- **AND** Buildr MUST NOT 因缺失声明改变 `capabilities.yml`、`commands.yml` 或 Service registry

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
- **THEN** Application MUST validate the Domain, atomically update v2 manifest and return the new revision
- **AND** all other Project entries and fields MUST remain unchanged

#### Scenario: 拒绝 identity 或 source 修改
- **WHEN** caller submits `id`, `workspaceId`, `code`, `source`, path, Git declaration or unknown fields
- **THEN** Application MUST reject the whole mutation before write

#### Scenario: registry revision 冲突
- **WHEN** the supplied revision differs from actual manifest bytes
- **THEN** Application MUST return a stable conflict result
- **AND** MUST NOT merge or overwrite external changes

### Requirement: 新建 Project 必须初始化 canonical Service registry
Buildr MUST 在创建 Project 时使用父实体 identity 初始化 `buildr.services/v2` 空 registry。

#### Scenario: 创建 Workspace Project
- **WHEN** Project 创建成功并安装基线资产
- **THEN** `services/manifest.yml` MUST 使用 `buildr.services/v2`
- **AND** 顶层 `projectId` MUST 等于新 Project UUID

#### Scenario: Project 创建回滚
- **WHEN** Service registry 初始化失败
- **THEN** Project create transaction MUST 不留下半完成 Project 或 registry

### Requirement: Project context必须识别Preparation Declaration
Buildr MUST将已登记Project根的`preparation.yml`识别为可选Project context asset，保持Project ownership并独立于`capabilities.yml`、`commands.yml`和`verification.yml`。Project create、sync、Doctor或GET MUST不静默生成或更新该声明。

#### Scenario: Project没有Preparation Declaration
- **WHEN** 创建或诊断一个没有`preparation.yml`的Project
- **THEN** Project registry MUST保持有效
- **AND** Buildr MUST不根据Service目录内容自动写入声明

#### Scenario: 未登记Project目录包含声明
- **WHEN** `projects/`下未登记目录包含`preparation.yml`
- **THEN** Buildr MUST不把它当作已登记Project声明执行
- **AND** Doctor MAY按现有未登记资产政策报告目录事实
