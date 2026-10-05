# Root Organization Workspace

## Purpose

定义 Buildr root-as-Organization workspace 的默认初始化资产、项目路径、scope 表达和 legacy 布局边界。
## Requirements

### Requirement: Buildr root 作为 Organization 上下文实例
Buildr MUST 将默认初始化目录定义为一个 Organization 上下文实例，而不是多 Organization 容器。

#### Scenario: 个人上下文
- **WHEN** 个人用户在 `~/personal` 初始化 Buildr
- **THEN** Buildr MUST 将 `~/personal` 作为该用户个人项目的 Organization 上下文根目录

#### Scenario: 公司上下文
- **WHEN** 用户在 `~/acme` 初始化 Buildr
- **THEN** Buildr MUST 将 `~/acme` 作为示例公司或组织的 Project 资产根目录

### Requirement: Workspace metadata 使用稳定领域 identity
Buildr MUST 使用 `.buildr/workspace.yml` 持久化 Workspace 的 UUID `id`、`name` 和 `description`，并将该文件作为本地 Workspace metadata 的 canonical source。

#### Scenario: canonical Workspace metadata
- **WHEN** Buildr 创建或迁移 Workspace metadata
- **THEN** `.buildr/workspace.yml` MUST 声明 `schemaVersion: buildr.workspace/v1`
- **AND** MUST 包含系统生成且持久化的 UUID `id`
- **AND** MUST 包含非空 `name` 和 `description`
- **AND** 历史 `kind` 与 `profile` MUST NOT 成为 Workspace Domain 字段
- **AND** 文件适配层 MAY 将 `kind` 与 `profile` 保留为兼容 metadata，但 Application MUST 将其视为只读且不属于 Workspace Domain

#### Scenario: Workspace identity 稳定
- **WHEN** Workspace 名称、说明、Git checkout 位置或文件内容发生变化
- **THEN** Buildr MUST 保持已经持久化的 Workspace UUID 不变
- **AND** MUST NOT 根据当前绝对路径重新生成 identity

#### Scenario: 旧 Workspace metadata 兼容读取
- **WHEN** Buildr 读取旧 `schemaVersion: 1` 或无 schemaVersion 的 Workspace metadata
- **THEN** Buildr MUST 返回真实 name、兼容 metadata 和 migration-required 状态
- **AND** 只读操作 MUST NOT 修改 Workspace 文件

#### Scenario: 旧 Workspace metadata 显式迁移
- **WHEN** Buildr 通过 canonical sync 显式迁移旧 Workspace metadata
- **THEN** Buildr MUST 优先复用合法的 `skills/manifest.yml.workspaceId`，仅在两处都没有 Workspace identity 时生成一次 UUID
- **AND** MUST 保留已有 name
- **AND** 缺少 description 时 MUST 写入明确 TODO 并产生可见诊断
- **AND** 迁移失败 MUST 保持旧文件不变

### Requirement: 初始化创建可直接工作的根资产
`buildr init` MUST create workspace assets that can receive Buildr product builtins and Components and render supported Agent runtimes.

#### Scenario: 初始化根资产
- **WHEN** 智能体（Agent）在 `.buildr/workspace.yml` 及项目、服务、代码库三份清单路径均无既有文件系统条目（Filesystem Entry，包括文件、目录或链接）的全新目录执行 `buildr init --target <dir> --name <name> [--description <description>]`
- **THEN** Buildr MUST create root source assets including `.buildr/`, `rules/`, `skills/`, `commands/`, `components/` and `projects/`
- **AND** Buildr MUST NOT create a root `practices/` directory
- **AND** Buildr MUST create `.buildr/workspace.yml` with `schemaVersion: buildr.workspace/v1`、a generated UUID、name and description
- **AND** 未提供 description 时 Buildr MUST 写入明确 TODO 并让 doctor 产生可见提示
- **AND** Buildr MUST create `rules/manifest.yml`, `skills/manifest.yml`, `commands/manifest.yml`, `components/manifest.yml` and `projects/manifest.yml`
- **AND** `skills/manifest.yml` MUST declare `schemaVersion: buildr.skills/v3`
- **AND** `skills/manifest.yml.workspaceId` MUST equal `.buildr/workspace.yml.id`
- **AND** `components/manifest.yml` MUST declare `schemaVersion: buildr.components/v1`
- **AND** `projects/manifest.yml` MUST declare `schemaVersion: buildr.projects/v2`
- **AND** 空的全局 `services/manifest.yml` 与 `repositories/manifest.yml` MUST 分别使用 `buildr.services/v3` 与 `buildr.repositories/v1`；已有布局继续遵循显式迁移与恢复边界，不以初始化补齐半完成全局清单
- **AND** Buildr MUST create root `AGENTS.md` required block 并内联随包核心规则正文
- **AND** Buildr MUST be able to render initial Agent runtime for supported adapters

#### Scenario: 初始化 Codex runtime
- **WHEN** Buildr initializes a new workspace for Codex usage
- **THEN** Buildr MUST keep `AGENTS.md` as the native Codex rule entry
- **AND** Buildr MUST be able to project enabled Skills, including enabled Component Skills, to `.agents/skills/`

#### Scenario: 初始化 Claude Code runtime
- **WHEN** Buildr initializes or syncs workspace for Claude Code usage
- **THEN** Buildr MUST be able to generate Claude Code runtime projection from the same Buildr source assets, enabled builtins and enabled Components model

### Requirement: 项目资产使用根 projects 目录
Buildr MUST 默认使用根 `projects/<project>/` 维护项目级业务资产，并使用 `projects/manifest.yml` 管理 Project 集合，但 MUST NOT 在 Project 下创建或维护 Skill 源目录。

#### Scenario: 创建项目
- **WHEN** 在没有全局服务（Service）及代码库实例（Repository Instance）清单的旧项目级布局中，Agent executes `buildr project create pig --target <root>`
- **THEN** Buildr MUST create project-level `AGENTS.md`、`openspec/`、`services/` and `services/manifest.yml` under `<root>/projects/pig/`
- **AND** Buildr MUST NOT create `<root>/projects/pig/skills/`、`<root>/projects/pig/skills/manifest.yml` or `<root>/projects/pig/practices/`

#### Scenario: 未指定组织的 service 接入
- **WHEN** 在旧项目级服务（Service）布局中，Agent executes `buildr service create pig/freshx <repo-ref> --target <root>`
- **THEN** Buildr MUST attach that service to `<root>/projects/pig/` service metadata and default service repo directory
- **AND** service metadata MUST be written to `<root>/projects/pig/services/manifest.yml`

### Requirement: 默认 scope 使用根相对表达
Buildr MUST 使用真实 workspace 相对路径作为 canonical scope 表达。

#### Scenario: workspace scope
- **WHEN** Agent 使用 `--scope .`
- **THEN** Buildr MUST 将 scope 解析为 workspace root

#### Scenario: Project scope
- **WHEN** Agent 运行 `buildr runtime check claude-code --scope projects/pig --target <root>`
- **THEN** Buildr MUST 将 scope 解析为真实目录 `<root>/projects/pig`
- **AND** Buildr MUST 解析根规则、Project 规则和相关 runtime 投射状态

#### Scenario: Service canonical scope
- **WHEN** Agent 使用 `--scope projects/pig/services/api`
- **THEN** Buildr MUST 将 scope 解析为真实目录 `<root>/projects/pig/services/api`
- **AND** Buildr MUST NOT 隐式插入第二个 `services/` 路径段

#### Scenario: Service 深层 scope
- **WHEN** Agent 使用 `--scope projects/pig/services/api/src/orders`
- **THEN** Buildr MUST 将整个输入作为 workspace 相对真实路径解析
- **AND** Buildr MUST reject absolute paths, workspace escape paths, and missing scope directories

#### Scenario: 旧 Service scope 无歧义兼容
- **WHEN** Agent 使用旧 scope `projects/pig/api`，`api` 是已登记 Service，真实输入位置不存在且 canonical Service 路径唯一
- **THEN** Buildr MUST 将其兼容解析为 `projects/pig/services/api`
- **AND** Buildr MUST 输出迁移 warning
- **AND** receipt、doctor next step、help 和 runtime metadata MUST 只输出 canonical scope

#### Scenario: 旧 Service scope 存在歧义
- **WHEN** 旧 Service scope 既可能表示真实 Project 子目录又可能表示已登记 Service
- **THEN** Buildr MUST reject the ambiguous scope
- **AND** Buildr MUST 提示用户使用真实 workspace 相对路径

### Requirement: 移除 legacy organizations 入口
Buildr MUST NOT 将 `organizations/<org>/` 作为产品主线、兼容路径或默认 scope 解析入口。

#### Scenario: 拒绝 legacy project ref
- **WHEN** Agent 调用 `buildr project create acme/shop`
- **THEN** Buildr MUST 报告该 ref 不受支持，并提示使用 `buildr project create shop`

#### Scenario: 拒绝 legacy service ref
- **WHEN** Agent 调用 `buildr service create acme/shop/api <repo-ref>`
- **THEN** Buildr MUST 报告该 ref 不受支持，并提示使用 `buildr service create shop/api <repo-ref>`

#### Scenario: 拒绝 legacy scope
- **WHEN** Agent 调用 `buildr doctor --scope organizations/acme/projects/shop --json`
- **THEN** Buildr MUST 报告该 scope 不受支持，并提示使用 `projects/shop`

### Requirement: 默认 workspace 规则路由工具型资产维护
默认工作空间（Workspace）规则（Rule）MUST 保护源资产权威、所有权和授权边界；Buildr 技能（Skill）MUST 负责工具型资产维护的发现、方法、命令与恢复指引，规则（Rule）MUST NOT 复制这些执行流程。

#### Scenario: Agent 读取默认规则
- **WHEN** 智能体（Agent）读取 `buildr init` 生成的 `AGENTS.md`
- **THEN** 规则（Rule）MUST 说明 Buildr 管理长期源资产和可重建投射
- **AND** MUST 说明运行时（Runtime）、本机状态、凭证和临时提示词不是源资产

#### Scenario: 用户要求维护 manifest-backed 工具型资产
- **WHEN** 用户要求新增、修改或删除可复用技能（Skill）或命令（Command）
- **THEN** Buildr 技能（Skill）MUST 按相应清单和命令维护源资产
- **AND** MUST 按需在源资产维护后执行投射或补齐本机环境，并遵守既有授权

#### Scenario: 用户要求维护规则资产
- **WHEN** 用户要求维护根规则（Rule）或项目（Project）、服务（Service）规则（Rule）
- **THEN** Buildr 技能（Skill）MUST 区分 `rules/manifest.yml` 登记与 `AGENTS.md` 正文维护
- **AND** MUST 保留受管区块（Managed Block）所有权和用户正文，仅由正式维护入口更新受管区块（Managed Block）

#### Scenario: Agent 不确定如何维护资产
- **WHEN** 智能体（Agent）不确定如何维护工具型资产
- **THEN** 智能体（Agent）MUST 按用户意图发现 Buildr 技能（Skill）并按需读取当前命令帮助
- **AND** 技能（Skill）不可用时 MUST 根据 `buildr help skill install` 与命令参考修复相应入口

#### Scenario: runtime 或本机缺少能力
- **WHEN** 当前运行时（Runtime）缺少技能（Skill）或本机缺少命令（Command）
- **THEN** 智能体（Agent）MUST 依据当前诊断定位缺失边界，并在已有授权内执行对应恢复
- **AND** MUST NOT 因局部能力缺失阻止其他不依赖该能力的已授权工作

### Requirement: Root Rules manifest CLI maintenance
Buildr CLI MUST 提供 root/Organization-level commands，用于维护 user-managed Rules manifest entries，且不得接管 Agent context decisions。

#### Scenario: Add existing root Rule
- **WHEN** Agent runs `buildr rules add <id> --target <dir> --description <text>` for an initialized Buildr workspace
- **THEN** Buildr MUST add or replace a root `rules/manifest.yml` entry only when the referenced Markdown file already exists and the id, path, source, description, enabled, required, and state metadata are valid
- **AND** Buildr MUST default the rule path to `rules/<id>.md` when `--path` is omitted
- **AND** Buildr MUST allow `--path <relative-md-path>` to register an existing relative Markdown file inside the workspace
- **AND** Buildr MUST require a non-empty description
- **AND** Buildr MUST NOT modify `AGENTS.md`正文 or Agent runtime files

#### Scenario: Add missing root Rule file
- **WHEN** Agent runs `buildr rules add <id>` with a path that does not exist
- **THEN** Buildr MUST fail without changing `rules/manifest.yml`
- **AND** Buildr MUST explain that `rules add` registers an existing root Rule file

#### Scenario: Remove root Rule asset
- **WHEN** Agent runs `buildr rules remove <id> --target <dir>` for a user-managed Rule
- **THEN** Buildr MUST remove the matching entry from root `rules/manifest.yml`
- **AND** Buildr MUST delete the referenced Rule source file by default
- **AND** Buildr MUST keep the Rule source file only when `--keep-file` is provided
- **AND** Buildr MUST NOT modify `AGENTS.md`正文 or Agent runtime files

#### Scenario: Keep root Rule file while unregistering
- **WHEN** Agent runs `buildr rules remove <id> --target <dir> --keep-file` for a user-managed Rule
- **THEN** Buildr MUST remove the matching entry from root `rules/manifest.yml`
- **AND** Buildr MUST keep the referenced Rule source file
- **AND** subsequent doctor MUST report the kept Markdown file as unregistered unless it is re-registered or removed

#### Scenario: Protect required Buildr Rule
- **WHEN** Agent runs `buildr rules remove <id>` for a Rule whose manifest entry has `source: buildr` and `required: true`
- **THEN** Buildr MUST fail without changing `rules/manifest.yml`
- **AND** Buildr MUST explain that required Buildr Rules cannot be removed through `rules remove`

#### Scenario: Project Rules manifest remains out of scope
- **WHEN** Agent attempts to use `rules add/remove` for `projects/<project>` scope
- **THEN** Buildr MUST reject the operation
- **AND** Buildr MUST explain that Project rules are currently maintained through `projects/<project>/AGENTS.md`

### Requirement: Service 层级源资产支持作为后续统一方向
Buildr MUST 在产品路线中将 service 层级源资产支持作为统一后续方向记录，而不是在单个 manifest-backed 命令中局部引入不一致的 service scope。

#### Scenario: 记录 service 层级方向
- **WHEN** Buildr 文档描述 manifest-backed 资产维护命令的 scope 边界
- **THEN** 文档 MUST 说明本变更不改变现有 scope 模型
- **AND** 文档 MUST 记录后续统一评估 service scope 下 rules、skills、commands 或后续源资产模块的解析、叠加/覆盖、来源链和权限模型

### Requirement: 已有 workspace 升级兼容
Buildr MUST 支持已有 Buildr workspace 兼容内置能力和 adapter render 模型。

#### Scenario: 已有 workspace update
- **WHEN** Agent 在已有初始化 workspace 中运行 Buildr update
- **THEN** Buildr MUST 保留已有用户资产
- **AND** Buildr MUST 增加或更新 manifest 中的产品内置能力状态，同时不静默覆盖用户编写的规则正文

#### Scenario: 保留遗留 Practices 目录
- **WHEN** 已有 workspace root 或已登记 Project 中存在 `practices/` 目录
- **THEN** Buildr init、update、sync、Project repair 和 doctor MUST NOT 删除、覆盖、移动或读取其中内容
- **AND** 该目录 MUST NOT 阻塞正常命令或被视为缺失的当前 baseline 资产
- **AND** doctor with information findings enabled MUST report an informational finding that does not require immediate user action

#### Scenario: 已有 AGENTS
- **WHEN** 已有 workspace 中存在 `AGENTS.md`
- **THEN** Buildr MUST 只检查并修复 Buildr required block
- **AND** Buildr MUST NOT 覆盖用户正文

#### Scenario: 旧版规则迁入
- **WHEN** 已有 workspace 使用旧版 package baseline rules
- **THEN** Buildr MUST 将核心规则内联到根 `AGENTS.md`，其他专业规则仍使用通用规则清单
- **AND** Buildr MUST 将旧 `runtime.md` 语义内化进 根 `AGENTS.md` 受管区块

### Requirement: 遗留 Practices 内容迁移说明
Buildr MUST 将遗留 `practices/` 视为用户保留数据，并提供基于内容语义的人工迁移说明。

#### Scenario: Agent 处理遗留 Practices 内容
- **WHEN** Agent 或用户决定整理已有 `practices/` 内容
- **THEN** Buildr guidance MUST 说明约束和值守边界迁移为 Rule
- **AND** guidance MUST 说明可复用专业动作和操作流程迁移为 Skill
- **AND** guidance MUST 说明产品事实、需求和变更迁移为 OpenSpec
- **AND** guidance MUST 说明其他说明保留为普通 docs
- **AND** Buildr MUST NOT 根据文件名或正文自动决定迁移类别

### Requirement: 多层 AGENTS.md 规则资产投射
Buildr MUST treat `AGENTS.md` files at every supported directory level as rule source assets and expose the selected scope's ancestor chain plus recursively discovered subtree through supported Agent runtime adapters.

#### Scenario: Project scope 递归发现
- **WHEN** Buildr renders rules for scope `projects/pig`
- **THEN** Buildr MUST discover applicable `AGENTS.md` from workspace root through `projects/pig`
- **AND** Buildr MUST recursively discover `AGENTS.md` under the `projects/pig` subtree
- **AND** Buildr MUST order broader sources before more specific sources

#### Scenario: Service scope 隔离
- **WHEN** Buildr renders rules for scope `projects/pig/services/api`
- **THEN** Buildr MUST include applicable Root、Project and API Service ancestor rules
- **AND** Buildr MUST recursively include deeper `AGENTS.md` under the API Service
- **AND** Buildr MUST NOT include sibling Service subtree rules

#### Scenario: Claude Code recursive rule bridges
- **WHEN** recursive discovery returns multiple `AGENTS.md` files for Claude Code
- **THEN** Buildr MUST project a Claude Code rule bridge beside every discovered source file
- **AND** each bridge MUST reference the `AGENTS.md` in the same directory

#### Scenario: Codex native recursive rules
- **WHEN** Buildr syncs or checks Codex runtime for a canonical scope
- **THEN** Buildr MUST rely on Codex native `AGENTS.md` behavior for rule loading
- **AND** Buildr runtime check MUST verify every applicable and recursively discovered `AGENTS.md` source without writing bridge files

#### Scenario: 递归扫描安全边界
- **WHEN** Buildr recursively discovers rule sources
- **THEN** Buildr MUST NOT follow directory symlinks or enter VCS metadata、Agent runtime、dependency or build-output directories
- **AND** Buildr MUST traverse a nested Git repo only when it is a Buildr-managed Project or Service asset root
- **AND** Buildr MUST treat unregistered nested Git repos as opaque boundaries

### Requirement: Workspace 是 Skill 治理根和工作目录边界
Buildr MUST 将 Workspace 定义为 Skill 源资产治理根，并 MUST 将 workspace Skill 的本地 runtime 投射边界定义为 Agent 当前工作目录，而不是 Project 业务节点。

#### Scenario: Workspace 与工作目录语义一致
- **WHEN** Agent 从 Buildr workspace 根执行 workspace Skill render
- **THEN** Buildr MUST 将该 workspace 根视为 Agent 工作目录投射目标
- **AND** Buildr MUST 从根 `skills/manifest.yml` 读取全部受管 Skill 源

#### Scenario: Project 不作为 Skill runtime scope
- **WHEN** workspace 登记多个 Project
- **THEN** Buildr MUST 将 Project 保持为业务、依赖和能力上下文节点
- **AND** Buildr MUST NOT 声称 Project 目录能够限制 Skill 的 Agent runtime 可见范围

### Requirement: 核心原则必须区分研发协作与业务产品设计
随包规则 MUST明确原则约束 Buildr 产品及工作空间中的人机协作；MUST不自动要求被开发业务软件采用智能体优先产品形态；六条已确认原则正文 MUST保留。

#### Scenario: 工作空间更新
- **WHEN** 传统业务工作空间同步规则
- **THEN** 协作遵循规则，业务产品设计仍遵循自身目标与约束
