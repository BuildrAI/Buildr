# workspace-first runtime 投射规范

## Purpose

定义 Buildr 标准规则资产与 Agent runtime 投射产物的边界，以及 MVP 以 workspace runtime 为主路径的行为。
## Requirements
### Requirement: Buildr 标准规则资产独立于 Agent runtime
Buildr MVP MUST 将 `AGENTS.md` 作为 Buildr 标准规则资产，并将 Agent runtime 目录视为可重建投射产物。

#### Scenario: 管理标准规则资产
- **WHEN** Buildr 管理组织、项目或服务级规则
- **THEN** Buildr MUST 以 `AGENTS.md` 或 Buildr 资产源文件作为长期规则资产

#### Scenario: 管理 Agent runtime 目录
- **WHEN** Buildr 为 Claude Code、Codex、Trae、Cursor 或其他 Agent 渲染 runtime
- **THEN** Buildr MUST 将 `.claude/`、`.codex/`、`.trae/`、`.cursor/` 等目录视为投射产物，而不是组织或项目资产源

### Requirement: workspace runtime 是 MVP 主路径
Buildr MVP MUST 优先保证 Buildr workspace 入口处的 Agent runtime 可用。

#### Scenario: 初始化 workspace runtime
- **WHEN** Agent 完成 Buildr workspace 初始化
- **THEN** Buildr MUST 能为当前 Agent 渲染或检查 workspace 级 runtime 桥接文件

#### Scenario: 多 Agent 使用同一 workspace
- **WHEN** 不同用户分别使用 Claude Code、Codex 或 Trae 打开同一个 Buildr workspace
- **THEN** 每个 Agent MUST 能基于 Buildr 标准资产生成自己的 runtime 投射，而不要求这些 runtime 目录成为共享资产源

### Requirement: service repo 不作为 MVP 独立 Agent runtime 入口
Buildr MVP MUST 将 Buildr workspace 作为 Agent 工作入口，不得将 service repo runtime 作为 service 接入的默认或必需能力。

#### Scenario: 只接入 service repo
- **WHEN** Agent 通过 `service create` 接入 project service repo
- **THEN** Buildr MUST NOT 向该 service repo 写入 `CLAUDE.md`、`.claude/` 或其他 Agent runtime 文件

#### Scenario: 用户只打开 service repo
- **WHEN** 用户只在 service repo 目录中打开 Agent
- **THEN** Buildr MVP MUST NOT 将该目录视为完整 Buildr workspace 入口

#### Scenario: 用户权限被裁剪
- **WHEN** 用户只拥有某个项目或服务的权限
- **THEN** Buildr MUST 通过裁剪后的 Buildr workspace 资产提供上下文，而不是要求用户脱离 workspace 在 service repo 中工作

### Requirement: Buildr 作为 Agent 时代的项目契约
Buildr MVP MUST 将 Buildr 使用方式定义为跨 Agent 的项目协作契约。

#### Scenario: Agent 原生支持 Buildr
- **WHEN** 用户使用的 Agent 产品原生支持 Buildr
- **THEN** Agent MUST 能直接按 Buildr workspace 资产和规则工作

#### Scenario: Agent 未原生支持 Buildr
- **WHEN** 用户使用的 Agent 产品未原生支持 Buildr
- **THEN** 用户 MUST 能通过自然语言触发 Buildr bootstrap guide，让 Agent 学会使用 Buildr CLI 和 workspace 资产

### Requirement: Runtime 投射按 Agent 能力选择
Buildr MUST 将支持的 Agent runtime 视为从 Buildr 源资产、canonical scope discovery plan 和已启用内置能力生成的 adapter 投射。

#### Scenario: Codex runtime 投射
- **WHEN** Buildr 渲染 Codex adapter
- **THEN** Buildr MUST 保持 discovered `AGENTS.md` files 作为 Codex 原生规则入口
- **AND** Buildr MUST NOT 为 Rules 写入 Codex bridge 文件
- **AND** Buildr MUST 将适用的已渲染 Skills 安装到当前 Codex 打开工作目录的 `.agents/skills/`
- **AND** Buildr MUST 将 `.agents/skills/` 视为 workspace destination 投射产物，而不是长期 Buildr 源资产

#### Scenario: Claude Code runtime 投射
- **WHEN** Buildr 渲染 Claude Code adapter
- **THEN** Buildr MUST 为 discovery plan 中每个 `AGENTS.md` 写入或更新同目录 `CLAUDE.md` 引用桥
- **AND** Buildr MUST 将适用的已渲染 Skills 安装到当前工作目录的 `.claude/skills/`
- **AND** Buildr MUST 将 `CLAUDE.md` 和 `.claude/skills/` 视为 workspace destination 投射产物，而不是长期 Buildr 源资产

#### Scenario: 支持的 adapters
- **WHEN** Buildr syncs or renders Agent runtime
- **THEN** Buildr MUST 支持 `codex` 和 `claude-code`
- **AND** Buildr MUST 清楚报告不支持的 adapter，且不得修改 runtime 文件

#### Scenario: Runtime 准备顺序
- **WHEN** Buildr 渲染 Agent runtime
- **THEN** Buildr MUST 按 `rules/manifest.yml` 暴露和检查 enabled rules
- **AND** Buildr MUST 按 workspace `skills/manifest.yml` 投射 enabled skills
- **AND** Buildr 内置项 MUST 在 manifest 中排在用户项之前
- **AND** rule discovery plan MUST order ancestor sources before descendant sources
- **AND** 在处理 Project scope 时，Buildr MUST 在 workspace 资产之后处理 Project 用户资产与 capability/applicability context
- **AND** 更具体的源资产 MUST 在 Agent 可读入口中更靠后出现

#### Scenario: Rules 语义索引读取
- **WHEN** Agent 进入 Buildr workspace scope
- **THEN** Agent MUST 先读取 applicable `AGENTS.md` 和 `rules/buildr/core.md`
- **AND** Agent MUST 再读取 `rules/manifest.yml`
- **AND** Agent MUST 根据用户目标、修改范围、代码语义、workspace context 和 Rule `description` 判断 enabled user Rules 是否与当前任务相关
- **AND** Agent MUST NOT require `rules/manifest.yml` to contain structured role, path, service, or directory routing tables

#### Scenario: Rule 和 Skill 加载语义
- **WHEN** Buildr exposes Rules and Skills to an Agent runtime
- **THEN** Buildr MUST distinguish Rules and Skills by asset semantics rather than by whether they are always loaded
- **AND** Buildr MUST treat Rules as values, boundaries, and constraints
- **AND** Buildr MUST treat Skills as reusable professional actions and procedures

#### Scenario: Rule manifest 状态消费
- **WHEN** Agent consumes a valid `rules/manifest.yml`
- **THEN** Agent MUST read every enabled、required and installed Rule before performing workspace work
- **AND** Agent MUST inspect the description of every enabled、non-required and installed Rule
- **AND** Agent MUST read an optional Rule body before acting when user goals、changed files、code semantics or workspace context make that Rule relevant
- **AND** Agent MUST NOT use disabled or uninstalled Rules for the current task
- **AND** adapter discovery MUST NOT decide semantic Rule relevance on behalf of the Agent

#### Scenario: 根 sync 递归投射
- **WHEN** Agent runs `buildr sync <agent> --target <root>` without an explicit scope
- **THEN** Buildr MUST use canonical scope `.`
- **AND** Rules projection MUST reconcile all supported `AGENTS.md` in the managed workspace subtree
- **AND** native adapters MUST perform no Rules writes

#### Scenario: 深层 Rules scope 与 Skills source 分离
- **WHEN** Agent renders a Service or deeper canonical scope through the combined `buildr render` command
- **THEN** Rules discovery MUST use the full canonical scope
- **AND** Skills resolution MUST use the workspace source authority and applicable Project capability/applicability context
- **AND** Buildr MUST NOT infer Service-level Skill source support

#### Scenario: Render conflict is validated before writes
- **WHEN** any planned rendered Rules target conflicts with a non-Buildr-managed runtime file
- **THEN** Buildr MUST fail before writing any planned Rules target
- **AND** Buildr MUST report every detected conflict in the selected scope

#### Scenario: Orphan managed bridge cleanup
- **WHEN** a selected scope contains a Buildr-managed rule bridge whose same-directory `AGENTS.md` no longer exists
- **THEN** rendered adapter reconcile MUST remove the orphan bridge
- **AND** Buildr MUST NOT remove non-Buildr-managed runtime files

### Requirement: Skills runtime 区分产品内置 Skill 与 workspace Skill
Buildr runtime projection MUST 区分产品内置 Agent Skills 与 workspace Skill source，并 MUST 将写入 user/workspace destination 的内容视为可重建 runtime 投射产物；Project MUST NOT 构成 Skill source、安装或可见性隔离层。

#### Scenario: 安装产品内置 Skill
- **WHEN** 当前 Agent runtime 支持 Skills 且 Buildr package manifest 声明了适用的产品内置 Agent Skill
- **THEN** `buildr skill install <agent>` MUST 将该 Skill 安装或修复到目标 Agent runtime
- **AND** `buildr skills render <agent>` MUST NOT 安装或修复该产品内置 Skill

#### Scenario: 保持 workspace Skill 解析
- **WHEN** workspace 根定义了 `skills/manifest.yml`
- **THEN** `buildr skills render <agent>` MUST 只从 workspace source authority 解析 enabled Skills
- **AND** Project `capabilities.yml` MUST 只提供 requirements、bindings 与 applicability context
- **AND** Buildr MUST 根据 manifest 条目的本地源、远端 resolved 状态和 install mode 选择 render 方式

#### Scenario: 渲染本地作者型 Skill
- **WHEN** Skill manifest 条目使用 `path`
- **THEN** `buildr skills render <agent>` MUST 从 workspace `skills/<skill-id>/SKILL.md` 读取源内容
- **AND** Buildr MUST 将该 Skill 投射到显式选择的 user 或 workspace destination

#### Scenario: 渲染已解析远端 Skill
- **WHEN** Skill manifest 条目包含 `resolved`
- **AND** install mode 是 `buildr`
- **THEN** `buildr skills render <agent>` MUST 从 resolved 精确安装源拉取 Skill 内容
- **AND** Buildr MUST 支持 `resolved.kind: skill-url`，其中 URL 内容是 raw `SKILL.md`
- **AND** 当 resolved kind 不受当前 CLI 支持时 Buildr MUST 报告错误
- **AND** Buildr MUST 在可用时校验 version 或 integrity
- **AND** Buildr MUST 将该 Skill 投射到显式选择的 destination

#### Scenario: 渲染未解析远端信息源
- **WHEN** Skill manifest 条目只有 `source` 或 install mode 是 `agent`
- **THEN** `buildr skills render <agent>` MUST NOT 将该 Skill 视为已安装
- **AND** Buildr MUST 生成 Buildr managed 的 Agent-readable 安装说明或安装任务
- **AND** 该说明 MUST 包含 manifest 中可用的 source/resolved 信息、Skill id、workspace source 和目标 Agent runtime
- **AND** 该说明 MUST 要求 Agent 阅读 source/resolved 信息、解析精确安装源或按来源指引安装到 Agent runtime

#### Scenario: runtime check 标识 Agent action
- **WHEN** Skill manifest 条目需要 Agent 安装或解析
- **THEN** runtime check 或 doctor MUST 报告该 Skill 需要 Agent action
- **AND** 该状态 MUST NOT 被计为 up to date
- **AND** 诊断结果 MUST 提供下一步建议

#### Scenario: 远端 resolved 缺少 integrity
- **WHEN** Skill manifest 条目包含 resolved 远端安装源
- **AND** manifest 没有声明 integrity
- **THEN** runtime check 或 doctor MUST 报告 warning
- **AND** warning MUST NOT 阻止 render，除非当前 policy 要求完整校验

#### Scenario: runtime 投射不是源资产
- **WHEN** Buildr 将产品内置 Agent Skill 或 workspace Skill 写入 user/workspace destination
- **THEN** 写入结果 MUST 被视为 runtime 投射产物
- **AND** Agent MUST NOT 将写入结果作为 Buildr 产品 Skill 或 workspace Skill 的源资产维护

### Requirement: AGENTS.md 是 scope 规则入口
Buildr MUST 将 `AGENTS.md` 定义为 Buildr scope 规则入口，同时允许支持它的 Agent 原生消费。

#### Scenario: 根 AGENTS required block
- **WHEN** Buildr 初始化或更新 workspace root
- **THEN** 根 `AGENTS.md` MUST 包含 Buildr required block
- **AND** required block MUST 引用 `rules/buildr/core.md`

#### Scenario: Adapter 格式转换
- **WHEN** 某个 Agent 需要特殊 include 格式
- **THEN** 对应 adapter MUST 在 runtime render 阶段转换
- **AND** Buildr 源资产 MUST NOT 把 Claude Code 的 `@` 当作通用语义

### Requirement: Agent runtime adapter discovery
Buildr MUST 提供 Agent-readable 的方式，用于发现已支持的 Agent runtime adapter、每个 adapter 实现的 render 能力、组合 traits 以及 Rules source discovery semantics。

#### Scenario: Agent lists supported runtime adapters
- **WHEN** Agent 运行 `buildr runtime list --json`
- **THEN** Buildr MUST 输出包含已支持 Agent runtime id 的 JSON
- **AND** 当 `claude-code` 和 `codex` adapter 已实现时，输出 MUST 包含 `claude-code` 和 `codex`
- **AND** 输出 MUST 包含 `requiredRenderCapabilities`
- **AND** 输出 MUST 包含受支持的 Rules、Skills、surface、activation 和 checker trait catalog
- **AND** 输出 MUST 描述每个已支持 adapter 的组合 traits、render 能力、实现模式和 runtime-specific 推荐命令

#### Scenario: Rules entry discovery metadata
- **WHEN** `runtime list --json` 描述 supported adapter 的 `rules-entry`
- **THEN** metadata MUST identify canonical scope syntax as workspace-relative paths
- **AND** metadata MUST describe recursive `**/AGENTS.md` source discovery and ancestor inclusion
- **AND** metadata MUST identify whether projection is native or rendered
- **AND** metadata MUST identify whether the capability writes files
- **AND** rendered projection MUST describe its target pattern

#### Scenario: Runtime list includes recommended command templates
- **WHEN** Buildr 输出 supported Agent runtime adapter 信息
- **THEN** 每个 supported adapter MAY 包含 `recommendedCommands`
- **AND** `recommendedCommands` MUST be treated as Agent execution guidance rather than a complete CLI schema
- **AND** `recommendedCommands` MUST NOT replace command help as the complete CLI reference
- **AND** recommended scope examples MUST use canonical workspace-relative paths

#### Scenario: Runtime list is available outside workspace
- **WHEN** Agent 在非 Buildr workspace 目录运行 `buildr runtime list --json`
- **THEN** Buildr MUST 返回当前 CLI 支持的 runtime adapter 矩阵和 trait catalog
- **AND** Buildr MUST NOT 要求目标目录已经初始化为 Buildr workspace

#### Scenario: Human lists supported runtime adapters
- **WHEN** 用户运行 `buildr runtime list`
- **THEN** Buildr MUST 输出人类可读的 supported Agent runtime adapter 摘要
- **AND** 摘要 MUST 说明每个 supported runtime 可使用的 render、sync、Skill install 和 runtime check 命令族

### Requirement: Runtime adapter descriptor 通过受约束 traits 组合
Buildr MUST 使用受约束的 Rules、Skills、surface、activation 和 checker traits 组合每个静态 runtime adapter descriptor，并从组合结果派生 runtime contract metadata。

#### Scenario: 组合完整 adapter
- **WHEN** Buildr 注册一个 supported runtime adapter
- **THEN** descriptor MUST 声明 Rules、Skills、surface、activation 和 checker traits
- **AND** composer MUST 从 traits 派生 required render capabilities、runtime targets、Rules discovery/projection metadata、Skills roots 和 checker metadata
- **AND** capability evidence MUST 继续归因到该具体 adapter id

#### Scenario: Trait 组合不完整
- **WHEN** descriptor 使用未知 trait、缺少 trait 必需参数、引用未注册 implementation，或 Rules 组合不能覆盖 Buildr 的完整 scope 语义
- **THEN** adapter validation MUST fail
- **AND** Buildr MUST NOT 将该 adapter 报告为 supported

#### Scenario: 复用 trait 不等于 runtime alias
- **WHEN** 两个 adapter 使用相同 Rules primitive 或 Skills layout trait
- **THEN** Buildr MUST 保留两个独立 adapter identity、metadata、capability evidence 和 contract tests
- **AND** Buildr MUST NOT 将一个 runtime id 解析或 fallback 到另一个 runtime id

#### Scenario: Environment probe 安全边界
- **WHEN** checker trait 声明 command installation 或 version probe
- **THEN** Buildr MUST 只执行随产品静态声明的 executable 和 arguments
- **AND** probe MUST 不经过 shell、具有有限超时且不执行 workspace 提供的代码
- **AND** 未声明 probe 时 Buildr MUST NOT 声称已检查目标 Agent 的安装或版本

### Requirement: Adapter render capability checklist
Buildr MUST 定义一个 supported Agent adapter 需要实现的 render 能力清单。

#### Scenario: Required render capabilities
- **WHEN** Buildr 报告 supported Agent runtime adapters
- **THEN** Buildr MUST 将 `rules-entry`、`product-buildr-skill`、`workspace-project-skills`、`skill-install-plans` 和 `runtime-check` 列为 required render capabilities
- **AND** 每个 supported adapter MUST 报告自己是否支持每个 required render capability

#### Scenario: Render capability implementation modes
- **WHEN** Buildr 描述某个 adapter render capability
- **THEN** Buildr MUST 允许该能力通过 native behavior、file render、Skill install、install-plan render 或 diagnostic check 实现
- **AND** Buildr MUST NOT 要求每个 render capability 都写文件

#### Scenario: Codex native rules entry
- **WHEN** Buildr 描述 Codex 的 `rules-entry` capability
- **THEN** Buildr MUST 描述该能力由 Codex 原生消费 `AGENTS.md` 实现
- **AND** Buildr MUST 表明 rules render 不会写入 Codex bridge 文件

### Requirement: Unsupported Agent runtime guidance
Buildr MUST 清楚地区分 unsupported Agent runtime 和 supported runtime 中缺失 render 结果的情况。

#### Scenario: Unsupported Agent runtime is discovered
- **WHEN** Agent 判断自己的 runtime id 不在 `buildr runtime list --json` 输出中
- **THEN** Agent MUST NOT 使用该 unsupported runtime id 运行 `render`、`sync`、`skill install` 或 `runtime check`
- **AND** Agent MUST NOT 使用 supported fallback adapter 代替
- **AND** Agent MUST 警示用户 Buildr 暂不支持当前 Agent runtime 的自动渲染
- **AND** Agent MUST 告诉用户联系 Buildr 作者反馈该 Agent

#### Scenario: Unsupported Agent guidance in runtime list
- **WHEN** Buildr 输出 `buildr runtime list --json`
- **THEN** 输出 MUST 包含 unsupported-Agent guidance
- **AND** 该 guidance MUST 包含 `mustNotUseFallbackAdapter: true`
- **AND** 该 guidance MUST 告诉用户联系 Buildr 作者反馈该 Agent

### Requirement: Runtime render asset scope
Buildr runtime render MUST 限定为由 Buildr 源资产派生出的 Agent runtime 入口资产。

#### Scenario: Supported runtime render
- **WHEN** Buildr render 或 sync 某个 supported Agent runtime
- **THEN** Buildr MUST 只 render 该 Agent runtime 使用 Buildr workspace rules 和 Skills 所必需的资产
- **AND** Buildr MUST 将 Commands、Project registry、Service registry、OpenSpec content、knowledge 和 docs 保持为 Buildr 源资产，而不是默认复制到 runtime 目录
- **AND** Buildr MUST NOT 将 Practices 表示为受管 source asset 或 runtime asset

#### Scenario: Product Buildr Skill boundary
- **WHEN** Buildr 为 supported Agent runtime 安装产品入口 Buildr Skill
- **THEN** Buildr MUST 使用 `buildr skill install <agent>`
- **AND** Buildr MUST NOT 将产品入口 Buildr Skill 登记到 workspace 或 Project `skills/manifest.yml`

### Requirement: Runtime 投射不得替代 Agent 构建任务上下文
Buildr runtime render MUST 只投射 supported Agent 使用组织工作资产所需的规则入口、Skills 和安装计划等 runtime 资产，并 MUST 保留由 Agent 根据当前任务判断相关性和形成任务上下文的责任边界。

#### Scenario: Agent 从投射后的工作环境开始任务
- **WHEN** Agent 在完成 Buildr runtime render 的 workspace 中处理一项任务
- **THEN** Buildr MUST 提供已受管工作资产的 Agent 可读入口
- **AND** Agent MUST 根据用户目标、修改范围、项目结构、资产语义和已有 workspace 信息选择任务相关内容
- **AND** Buildr MUST NOT 将 render 结果描述为已经构造完成的 context window

#### Scenario: 任务依赖其他岗位或服务信息
- **WHEN** 当前任务可能依赖其他岗位沉淀的规范、产品事实、专业流程或其他 Service 的信息
- **THEN** Agent MUST 能从 Buildr 组织的 workspace 与 Project 资产中发现和选择相关内容
- **AND** Buildr runtime adapter MUST NOT 使用固定岗位路由替 Agent 判断这些内容的语义相关性

### Requirement: Registry terminology
Buildr MUST 对列出受管资产的索引 manifest 统一使用 registry 术语。

#### Scenario: Project and Service registries
- **WHEN** Buildr 描述 root `projects/manifest.yml` 和 Project `services/manifest.yml`
- **THEN** Buildr MUST 分别称它们为 Project registry 和 Service registry
- **AND** Buildr MUST 将 metadata 保留给 registry entry 内部字段，例如 title、description、repo 和 path

### Requirement: Buildr 状态变更后必须 doctor 验证
Buildr required Core MUST 将 doctor 定义为已初始化 workspace 在 Buildr 状态变更后的统一完成条件。

#### Scenario: Workspace 源资产或 runtime 状态变更
- **WHEN** Agent 修改已初始化 workspace 的 Buildr 源资产、内置能力状态或 Agent runtime 投射
- **THEN** Agent MUST 在任务完成前运行当前 Agent 对应的 doctor
- **AND** Agent MUST NOT 在 doctor 仍报告需要立即处理的 error 时把该 Buildr 操作视为完成

#### Scenario: Buildr CLI 安装或刷新
- **WHEN** Agent 为一个已初始化 workspace 安装或刷新 Buildr CLI 开发入口
- **THEN** Agent MUST 在确认 CLI 可执行后运行当前 Agent 对应的 doctor

#### Scenario: Core 与 Skill 的职责
- **WHEN** Buildr 发布 doctor 完成约束
- **THEN** required Core MUST 只声明状态变更后必须验证的 invariant
- **AND** Buildr Skill 或 bootstrap MUST 提供具体 doctor 命令、执行时机和后续处理流程

### Requirement: Runtime plan 表达完整 Skill 文件 identity
Buildr runtime plan MUST 对完整 Skill 投射中的每个文件表达可验证的目标路径、内容编码、内容 identity 和必要权限，并 MUST 让 render、sync、runtime check、doctor 与 Component lifecycle 使用同一预期状态。

#### Scenario: 计划文本与二进制 Skill 文件
- **WHEN** Skill 源目录同时包含文本和二进制随附文件
- **THEN** runtime plan MUST 以确定性、可验证且可序列化的形式表达每个文件的原始字节
- **AND** reconcile MUST 按字节而不是 UTF-8 文本转换结果比较和写入这些文件

#### Scenario: 校验完整 Skill write item
- **WHEN** runtime plan 包含 Skill 文件的 encoding、内容或 mode 无效，或多个来源写入同一目标但 identity 不同
- **THEN** plan validation MUST 在写入前失败并报告具体目标
- **AND** runtime MUST NOT 产生部分 Skill 目录

#### Scenario: 所有 adapter 复用相同 Skill inventory
- **WHEN** 两个 supported adapters 使用 filesystem Skills primitive 渲染相同 Skill
- **THEN** 两个 adapter MUST 投射相同的 Skill 相对文件集合和内容 identity
- **AND** 每个 adapter MUST 继续使用自身声明的 runtime root、diagnostic identity 和 activation metadata

### Requirement: Runtime Skill 投射使用受管文件回执
Buildr MUST 为每个已投射的本地或 package runtime Skill 维护独立、可验证的受管文件回执，并 MUST 使用该回执区分 Buildr 投射文件与用户额外内容。

#### Scenario: 首次完整投射生成回执
- **WHEN** Buildr 成功投射一个本地或 package Skill
- **THEN** Buildr MUST 在对应 adapter 的 Buildr runtime metadata 区域写入该 Skill 的版本化投射回执
- **AND** 回执 MUST 记录 runtime path、source identity、受管相对文件、内容完整性和可执行状态

#### Scenario: 源 Skill 删除单个随附文件
- **WHEN** 上次回执登记了某个随附文件、当前源 Skill 已删除该文件且 runtime 文件仍匹配上次完整性
- **THEN** 下一次相同范围 render、sync 或 reconcile MUST 删除该 stale runtime 文件
- **AND** Buildr MUST 更新回执并保持其余 Skill 文件不变

#### Scenario: 用户修改受管随附文件
- **WHEN** runtime 随附文件不再匹配上次回执，且当前计划需要覆盖或删除它
- **THEN** Buildr MUST 在写入任何计划目标前报告 conflict
- **AND** Buildr MUST 保留用户修改内容和旧回执供后续处理

#### Scenario: Runtime Skill 包含未知额外文件
- **WHEN** runtime Skill 目录包含不在上次回执和当前 source inventory 中的文件
- **THEN** Buildr MUST 将该文件视为非 Buildr 管理内容并保留
- **AND** 当当前操作需要删除整个 Skill 时，Buildr MUST 报告需要用户处理而不是递归删除目录

#### Scenario: Skill 失去来源
- **WHEN** manifest 不再声明某个 runtime Skill，且其回执中的全部文件仍匹配、目录中也没有未知内容
- **THEN** 下一次 workspace 全量 render MUST 删除该 Skill 的受管文件、空目录和回执
- **AND** runtime check 与 doctor MUST 在 apply 前把相同状态报告为 orphan

#### Scenario: 回执缺失时保守降级
- **WHEN** runtime Skill 带有 Buildr-managed `SKILL.md` 但没有完整目录投射回执
- **THEN** Buildr MAY 继续兼容只含 `SKILL.md` 的旧运行时清理
- **AND** Buildr MUST NOT 删除无法证明由 Buildr 管理的其他文件

### Requirement: 完整 Skill 投射保持统一 preflight 与幂等性
Buildr MUST 在应用完整 Skill 目录计划前聚合所有文件冲突，并 MUST 在源资产、target、adapter 和 scope 不变时产生幂等结果。

#### Scenario: 任一随附目标发生冲突
- **WHEN** 完整 Skill 计划中的任一 `SKILL.md`、随附文件或回执目标存在不可安全覆盖的内容
- **THEN** Buildr MUST 在写入第一个计划文件前失败并列出全部已发现冲突
- **AND** 其他无冲突 Skill 也 MUST NOT 被部分更新

#### Scenario: 重复完整 Skill render
- **WHEN** 用户在源 Skill 目录、manifest、adapter、scope 和 runtime 目标均未变化时连续执行两次 render
- **THEN** 第二次执行 MUST 不新增、更新、chmod 或删除任何 Skill 文件或回执
- **AND** runtime check MUST 报告 Skill 文件集合与回执均为最新状态

### Requirement: 运行时同步必须得到稳定结果
Buildr MUST 根据相同的源资产、目标目录、Agent 和 scope 得到相同的运行时结果。

#### Scenario: 重复执行同步
- **WHEN** 用户在源资产没有变化时连续执行两次相同的 render 或 sync
- **THEN** 第二次执行 MUST 不再新增、更新或删除任何运行时文件

#### Scenario: 相关命令使用相同逻辑
- **WHEN** `render`、`skills render`、`sync` 或 Component 生命周期需要更新运行时
- **THEN** Buildr MUST 使用相同的目标检查、写入、清理和结果确认逻辑

### Requirement: 运行时冲突必须在写入前发现
Buildr MUST 在写入第一个运行时文件前检查当前命令范围内的所有目标冲突。

#### Scenario: 用户文件占用目标路径
- **WHEN** 任一目标路径存在非 Buildr 管理的文件
- **THEN** Buildr MUST 在零写入状态失败
- **AND** Buildr MUST 保留该用户文件并报告全部已发现冲突

#### Scenario: 不同内容使用相同目标路径
- **WHEN** 当前命令范围内的两个源要把不同内容写入同一个运行时路径
- **THEN** Buildr MUST 在零写入状态失败并报告两个来源

### Requirement: 运行时同步必须清理失去来源的受管文件
Buildr MUST 删除当前命令范围内已经没有来源的 Buildr 受管运行时文件和安装计划，并保留非 Buildr 管理的内容。

#### Scenario: Skill 被删除
- **WHEN** Skill 已从当前 scope 的源资产中删除并再次执行 `skills render` 或 `render`
- **THEN** Buildr MUST 删除对应的受管运行时 Skill

#### Scenario: 远程 Skill 被删除
- **WHEN** 需要 Agent 安装的远程 Skill 已从源资产中删除并再次渲染
- **THEN** Buildr MUST 删除对应的受管安装计划

#### Scenario: 受管目录包含额外用户文件
- **WHEN** 待清理的受管目录包含不能证明由 Buildr 管理的额外文件
- **THEN** Buildr MUST 保留该目录并报告需要用户处理

### Requirement: 运行时同步必须确认结果
Buildr MUST 在写入结束后确认本次命令负责的运行时状态已经与源资产一致。

#### Scenario: 同步后仍有差异
- **WHEN** 写入结束后仍存在本次命令负责的缺失、过期、孤儿或冲突状态
- **THEN** 命令 MUST 返回失败并给出可重新执行的修复动作

### Requirement: Buildr Core 要求简明表达
Buildr required Core MUST 要求 Agent 面向用户时优先使用常用、直接和简练的语言，避免使用不必要的专业术语。

#### Scenario: Agent 说明方案或结果
- **WHEN** Agent 向用户说明问题、方案、进度或结果
- **THEN** Agent MUST 优先使用用户容易理解的简练语言
- **AND** 只有准确表达所必需时才使用专业术语，并在需要时解释

### Requirement: Buildr Core 要求 Agent 引导下一步
Buildr required Core MUST 要求 Agent 在完成当前工作、到达阶段节点或遇到阻塞时，向用户说明明确、可执行的下一步。

#### Scenario: 当前事项存在下一步
- **WHEN** Agent 完成当前工作、到达阶段节点或遇到阻塞，且当前事项仍有后续动作
- **THEN** Agent MUST 结合当前状态以及适用的 Rule、Skill 和项目约定说明下一步

#### Scenario: 当前任务已经完整结束
- **WHEN** 当前任务已经完整结束且没有相关的后续动作
- **THEN** Agent MUST 明确说明任务已完成
- **AND** Agent MUST NOT 机械追加无关建议

### Requirement: Supported runtime adapter 使用静态完整契约
Buildr MUST 使用随产品发布的静态 registry 作为 supported Agent runtime adapter 的唯一事实源，并要求每个 registered adapter 通过受约束 traits 完整声明和实现 runtime contract。

#### Scenario: 注册完整 adapter
- **WHEN** package verification 校验一个 supported adapter
- **THEN** adapter descriptor MUST 包含稳定且唯一的 runtime id、完整 traits、全部 required render capabilities、runtime targets、实现入口和 Agent-readable metadata
- **AND** `runtime list`、CLI 参数校验、render、sync、Skill install、runtime check 和 doctor MUST 从同一组合后 registry descriptor 解析该 adapter

#### Scenario: Adapter contract 不完整
- **WHEN** registered adapter 缺少任一 required trait、required capability、实现入口或必要 capability evidence
- **THEN** package verification MUST fail
- **AND** Buildr MUST NOT 将该 adapter 报告为 supported

#### Scenario: 未注册 runtime
- **WHEN** Agent 请求一个不在静态 registry 中的 runtime id
- **THEN** Buildr MUST 将其作为 unsupported adapter 处理
- **AND** Buildr MUST NOT alias、猜测或 fallback 到其他 supported adapter

### Requirement: Adapter 只生成声明式运行时计划
每个 supported adapter MUST 从不可变 runtime context 生成无副作用的声明式计划，并由通用 Buildr core 执行全部文件系统副作用。

#### Scenario: 生成 runtime plan
- **WHEN** Buildr 为 supported adapter planning runtime
- **THEN** adapter MUST 返回预期 writes、native assets、managed removals、capability evidence 和适用 findings 或 repair hints
- **AND** adapter MUST NOT 直接写入或删除文件、修改 Buildr 源资产、运行 doctor 或执行 workspace 提供的代码

#### Scenario: 非法 runtime plan
- **WHEN** runtime plan 包含 target 越界、不安全路径、不同内容的重复 target、非法 removal 或与 descriptor 不一致的 capability evidence
- **THEN** 通用 plan validator MUST 在写入第一个文件前拒绝整个计划
- **AND** Buildr MUST 报告可归因于 adapter 和 target 的错误

#### Scenario: Native capability 不写文件
- **WHEN** adapter 以 native behavior 实现 `rules-entry`
- **THEN** runtime plan MUST 能将适用 `AGENTS.md` 表达为 native assets 和 capability evidence
- **AND** 通用 executor MUST NOT 因该 capability 自身写入 Rule bridge

### Requirement: Runtime 命令共享计划与 reconcile 管线
Buildr MUST 让 runtime render、sync、runtime check、doctor、产品 Buildr Skill 安装和 Component lifecycle 使用同一 source assembly、plan validation、preflight、apply、cleanup 和结果确认逻辑。

#### Scenario: Render 和 check 比较相同期望状态
- **WHEN** Buildr 对相同源资产、target、adapter 和 scope 分别运行 render 与 runtime check
- **THEN** 两者 MUST 从同一个 adapter plan 得到相同的预期 targets、content identity 和 managed removals
- **AND** runtime check MUST 使用 compare-only 模式而不写入文件

#### Scenario: Doctor 使用 adapter contract
- **WHEN** Agent 运行 `doctor --agent <agent>` 且 `<agent>` 是 supported adapter
- **THEN** doctor MUST 通过 registry 选择 adapter 并聚合通用 reconcile findings
- **AND** findings、repairs 和 capability 状态 MUST 归因到 `<agent>`
- **AND** doctor MUST NOT 通过独立 Agent allowlist 或分支重新定义该 adapter 的期望 runtime

#### Scenario: Component 生命周期 reconcile runtime
- **WHEN** Component source transaction 成功后需要 reconcile supported runtime
- **THEN** Component lifecycle MUST 调用与 `render` 相同的通用 runtime 管线
- **AND** Component lifecycle MUST NOT 调用 Component 提供的 adapter 或 runtime hook

### Requirement: Adapter 可以组合受约束的内置投射原语
Buildr MUST 允许不同静态 adapter 组合受约束的 Rules、Skills、surface、activation 和 checker traits，同时保持每个 runtime 的独立 identity、contract 和诊断归因。

#### Scenario: Rules trait 分类
- **WHEN** adapter 声明 Rules trait
- **THEN** trait kind MUST 是 `native-recursive`、`native-root`、`reference-bridge` 或 `vendor-rule-files` 之一
- **AND** `native-root` 或其他部分原生行为 MUST NOT 在没有完整 scope projection implementation 时认证 `rules-entry`

#### Scenario: Skills、surface 与 activation trait 分类
- **WHEN** adapter 声明非 Rules traits
- **THEN** Skills kind MUST 是 `agents-compatible` 或 `vendor-root`
- **AND** surface kind MUST 是 `ide`、`cli`、`desktop` 或 `cloud`
- **AND** Rules 和 Skills activation MUST 分别声明为 `immediate`、`path-read`、`session-start` 或 `explicit-reload`
- **AND** `explicit-reload` MUST 提供 Agent-readable reload guidance

#### Scenario: 两个 runtime 复用相同布局
- **WHEN** 两个 registered adapters 使用相同 Rules implementation 或 Skills layout
- **THEN** 它们 MAY 复用同一个内置投射 primitive
- **AND** 每个 adapter MUST 继续拥有独立 descriptor、capability evidence 和 contract tests
- **AND** Buildr MUST NOT 将其中一个 runtime id 解析为另一个 runtime id

#### Scenario: 验证 adapter 扩展点
- **WHEN** package tests 使用 fake adapter 验证新增 adapter 的集成路径
- **THEN** fake adapter MUST 只能通过测试注入点使用
- **AND** fake adapter MUST 能验证 trait composition、implementation dispatch 和 capability validation
- **AND** 发布的 `runtime list`、CLI help 和 package registry MUST NOT 将 fake adapter 报告为 supported

### Requirement: 现有 supported runtime 迁移保持兼容
Buildr MUST 在采用统一 adapter contract 后保持 `codex` 和 `claude-code` 的公开命令、runtime targets、managed ownership、冲突和清理语义兼容。

#### Scenario: Codex parity
- **WHEN** Buildr 使用迁移后的 `codex` adapter render 或 check 相同 workspace 状态
- **THEN** Buildr MUST 保持 native `AGENTS.md`、`.agents/skills/`、Skill install plans、managed marker 和 doctor 结果的既有语义

#### Scenario: Claude Code parity
- **WHEN** Buildr 使用迁移后的 `claude-code` adapter render 或 check 相同 workspace 状态
- **THEN** Buildr MUST 保持同目录 `CLAUDE.md` reference bridges、`.claude/skills/`、Skill install plans、managed marker 和 doctor 结果的既有语义

#### Scenario: 重复同步保持幂等
- **WHEN** 任一迁移后的 supported adapter 在源资产与目标状态不变时连续同步两次
- **THEN** 第二次同步 MUST 不新增、更新或删除 runtime 文件

### Requirement: 远端 Skill 解析必须有界完成
Buildr MUST 对远端 resolved Skill 的网络读取设置有限的连接、响应和总执行时间，使 runtime render、sync 和 doctor 能够成功完成或返回明确失败，而不是无限等待。

#### Scenario: 远端 Skill 来源不可达
- **WHEN** workspace Skill 的 resolved URL 无法连接、停止响应或超过配置的总时限
- **THEN** Buildr MUST 在有限时间内终止该次拉取
- **AND** Buildr MUST 返回包含 Skill 或 URL 上下文的错误
- **AND** Buildr MUST NOT 写入部分 runtime Skill 内容

#### Scenario: 维护者调整远端请求时限
- **WHEN** 维护者通过受支持的环境变量调整远端 Skill 请求时限
- **THEN** Buildr MUST 校验该值是有限正整数并限制到产品允许的最大范围
- **AND** 无效配置 MUST 明确失败而不是退回无限等待

### Requirement: Buildr 支持五个新增 Agent runtime adapters
Buildr MUST 将 `cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy` 注册为五个独立 supported runtime adapter，并为每个 adapter 完整实现 `rules-entry`、`product-buildr-skill`、`workspace-project-skills`、`skill-install-plans` 和 `runtime-check`。

#### Scenario: Runtime list 返回新增 adapters
- **WHEN** Agent 运行 `buildr runtime list --json`
- **THEN** `supportedAgents` MUST 包含 `cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`
- **AND** 每个 id MUST 对应独立 descriptor、traits、capability metadata、recommended commands 和 capability evidence
- **AND** Buildr MUST NOT 将任一新增 id alias 或 fallback 到其他 runtime

#### Scenario: 新增 adapter 契约不完整
- **WHEN** 任一新增 adapter 缺少 required capability、使用未注册 implementation、缺少 runtime-specific evidence 或不能覆盖 Buildr recursive Rules scope
- **THEN** adapter validation MUST fail
- **AND** Buildr MUST NOT 将该 adapter 报告为 supported

### Requirement: 新增 adapters 按目标 runtime 机制投射 Rules
Buildr MUST 为每个新增 adapter 使用已经认证的目标 runtime Rules 入口，同时保持 Buildr ancestor-before-descendant、scope ancestor chain、scope subtree 和 sibling isolation 语义。

#### Scenario: Cursor scoped project rule files
- **WHEN** Buildr render 或 check `cursor`
- **THEN** Buildr MUST 将每个 discovered `AGENTS.md` 确定性转换为同 source scope `.cursor/rules/buildr.mdc`
- **AND** nested rules MUST 依靠 Cursor nested project rules 目录作用域限定到对应 subtree，不依赖 native nested `AGENTS.md` 或中央 glob
- **AND** metadata MUST 将 Rules activation 描述为 `path-read`

#### Scenario: Qoder vendor rule files
- **WHEN** Buildr render `qoder`
- **THEN** Buildr MUST 将 discovered `AGENTS.md` 确定性转换为 `.qoder/rules` 下的 Buildr-managed rule files
- **AND** 转换结果 MUST 保留 source identity、scope 和 ancestor-before-descendant 顺序
- **AND** Buildr MUST NOT 依赖未认证的 Qoder native nested `AGENTS.md` 行为来补足 Rules scope

#### Scenario: TRAE vendor rule files
- **WHEN** Buildr render `trae`
- **THEN** Buildr MUST 将每个 discovered `AGENTS.md` 投射到该 source scope 可生效的 `.trae/rules` Buildr-managed target
- **AND** nested target MUST 只在对应目录或子树工作时应用
- **AND** sibling scope 的规则 MUST NOT 被投射为当前 sibling 的适用规则

#### Scenario: TRAE Work root reference bridge
- **WHEN** Buildr render `trae-work`
- **THEN** Buildr MUST 生成 TRAE Work 桌面版可导入的 Buildr-managed root reference bridge
- **AND** bridge MUST 明确要求 Agent 读取 root `AGENTS.md` 与当前工作路径 ancestor chain 中适用的 nested `AGENTS.md`
- **AND** runtime check MUST 报告 Rules import toggle 与新会话 activation guidance

#### Scenario: WorkBuddy root CODEBUDDY bridge
- **WHEN** Buildr render `workbuddy`
- **THEN** Buildr MUST 在 workspace root 生成短小的 Buildr-managed `CODEBUDDY.md` reference bridge
- **AND** bridge MUST 明确要求 Agent 读取 root `AGENTS.md` 与当前工作路径 ancestor chain 中适用的 nested `AGENTS.md`
- **AND** bridge MUST 不超过 WorkBuddy 5.2.5 已观察到的 8000 字符 project guidance 上限
- **AND** metadata MUST 将 Rules activation 描述为 `session-start`

### Requirement: Vendor rule files 与 root bridge 遵守通用 runtime 安全边界
Buildr MUST 让新增 Rules planners 只生成声明式 `RuntimePlan`，并复用通用 target validation、冲突预检、managed ownership、orphan cleanup 和 reconcile。

#### Scenario: 用户文件占用新增 adapter target
- **WHEN** Cursor、Qoder、TRAE、TRAE Work 或 WorkBuddy 的任一计划 target 已存在非 Buildr 管理内容
- **THEN** Buildr MUST 在写入任何计划 target 前失败
- **AND** Buildr MUST 保留全部用户内容并报告所有冲突

#### Scenario: 新增 adapter 重复同步
- **WHEN** 用户在 source assets、adapter、scope 和 target 不变时连续运行两次相同的新增 adapter render 或 sync
- **THEN** 第二次执行 MUST 不新增、更新或删除 runtime 文件

#### Scenario: 新增 adapter source 被删除
- **WHEN** Buildr-managed vendor rule file 或 bridge 已失去对应 source
- **THEN** 下一次相同范围 reconcile MUST 删除 orphan managed target 或从 root index 移除对应 source entry
- **AND** Buildr MUST NOT 删除非 Buildr 管理文件

### Requirement: 新增 adapters 使用各自认证的 Skills root 与 activation
Buildr MUST 将产品 Buildr Skill、workspace Skills 和 Skill install plans 投射到每个新增 runtime 为当前工作目录认证的 workspace destination Skills root，并公开其 activation 与 reload guidance。

#### Scenario: 共享 `.agents` Skills 投射
- **WHEN** Buildr 为 `cursor` 或 `trae` 安装或渲染 Skills
- **THEN** Buildr MUST 使用 `.agents/skills/<skill>/SKILL.md`
- **AND** Skill install plans MUST 位于 `.agents/buildr/skill-install-plans/`

#### Scenario: Vendor Skills 投射
- **WHEN** Buildr 为 `qoder`、`trae-work` 或 `workbuddy` 安装或渲染 Skills
- **THEN** Buildr MUST 分别使用 `.qoder`、`.trae` 或 `.codebuddy` 作为当前工作目录的 runtime root
- **AND** 每个 adapter MUST 继续保留独立 descriptor、activation、evidence 和 contract tests

#### Scenario: Skills 需要 reload 或新会话
- **WHEN** adapter 的 Skills activation 是 `explicit-reload` 或 `session-start`
- **THEN** runtime list、runtime check 和公开 adapter 文档 MUST 提供对应 reload 或新会话 guidance
- **AND** Buildr MUST NOT 将文件已写入描述为当前会话已经加载

### Requirement: 新增 adapters 的 checker 报告环境与前置条件事实
Buildr MUST 让每个新增 adapter 的 `runtime-check` 区分投射状态、安装/版本 probe 状态和 activation guidance，并且只执行随产品静态声明的有限时无 shell probe；产品级真实 Agent 验证缺口 MUST NOT 作为当前 workspace prerequisite finding。

#### Scenario: Environment probe 可自动执行
- **WHEN** descriptor 声明静态 command installation 或 version probe
- **THEN** runtime check MUST 使用静态 executable 和 arguments 在有限超时内执行
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence

#### Scenario: Environment 只能人工确认
- **WHEN** 目标 surface 没有稳定、安全、跨安装形态的 command probe
- **THEN** descriptor MUST 使用 `manual` probe 并给出确认 guidance
- **AND** runtime check MUST NOT 把该项报告为自动检查成功

#### Scenario: 文件系统无法证明 Agent 已加载投射
- **WHEN** Buildr 只能证明 Rules 或 Skills 投射存在，无法从文件系统证明目标 Agent 已在会话中加载
- **THEN** runtime list、runtime check 或权威文档 MUST 提供对应 activation guidance
- **AND** runtime check MUST NOT 仅因没有真实 Agent marker smoke 而生成当前用户必须处理的 prerequisite warning

### Requirement: 每个新增 adapter 保留独立兼容证据与分层验证状态
Buildr MUST 为每个新增 adapter 记录 runtime-specific 官方文档、本机观察或安装包源码 provenance，并 MUST 以可重复的 descriptor、plan、projection、checker 和 lifecycle tests 验证 Buildr 可负责的兼容边界；descriptor MUST NOT 编码真实 Agent marker smoke 状态或品牌特有的历史通过快照。

#### Scenario: 自动 contract evidence
- **WHEN** 产品验证检查新增 adapter
- **THEN** 每个 adapter MUST 有独立 capability evidence 和 contract fixture
- **AND** 共享 primitive 的测试结果 MUST NOT 代替具体 adapter 的五项 capability evidence
- **AND** 自动 tests MUST 覆盖投射格式、scope 顺序、兄弟隔离、Skills root、冲突保护、清理和 checker

#### Scenario: 兼容证据不声明真实会话已加载
- **WHEN** descriptor 记录 Rules、Skills 或 activation 的文档、源码或本机 intake provenance
- **THEN** Buildr MUST 将其描述为 adapter contract evidence
- **AND** MUST NOT 将该 evidence 表述为当前 workspace、当前版本或当前 Agent 会话已经真实加载投射
- **AND** descriptor MUST NOT 使用 `verified`、`pending` 或等价 smoke 状态区分 supported adapters

#### Scenario: WorkBuddy 不保留 smoke 特例
- **WHEN** 产品验证或 runtime list 读取 WorkBuddy descriptor
- **THEN** WorkBuddy MUST 使用与其他 supported adapters 相同的 contract evidence 模型
- **AND** descriptor MUST NOT 包含历史 product/runtime version、marker result 或 headless transcript 摘要

### Requirement: Adapter descriptor 声明可选 Skill publication extensions
Buildr MUST 允许 supported runtime adapter 的 Skills trait 声明受约束、静态且可验证的可选 publication extensions，并 MUST 由 package verification 从同一 descriptor 派生 adapter-specific extension 校验。

#### Scenario: Codex 发布 OpenAI Skill metadata
- **WHEN** 面向 `codex` runtime 发布的 package Skill 包含 `agents/openai.yaml`
- **THEN** Codex adapter extension profile MUST 校验该文件的 OpenAI metadata
- **AND** validation failure MUST 标识 `codex` adapter、Skill id 和无效的 metadata

#### Scenario: Codex Skill 没有 OpenAI UI 扩展
- **WHEN** 面向 `codex` runtime 发布的 package Skill 没有 `agents/openai.yaml`
- **THEN** Codex adapter MUST 继续使用 `SKILL.md` 的 `name` 和 `description` 发现并路由该 Skill
- **AND** package verification 和 render MUST NOT 因扩展缺失失败或生成该文件

#### Scenario: 非 OpenAI adapter 不消费 OpenAI metadata
- **WHEN** package Skill 面向未声明 OpenAI publication extension 的 adapter 发布
- **THEN** 该 adapter MUST NOT 因 `agents/openai.yaml` 缺失而判定发布失败
- **AND** 该 adapter MUST NOT 将该文件解释为自身 activation、routing 或 UI metadata

#### Scenario: Adapter publication extension 不安全或未知
- **WHEN** descriptor 声明绝对路径、逃逸路径、重复 extension 或不受支持的 vendor metadata format
- **THEN** adapter descriptor validation MUST fail
- **AND** Buildr MUST NOT 将该 adapter 报告为 supported

### Requirement: 完整 Skill 投射区分保留与消费
Buildr MUST 让所有 filesystem Skills adapters 保真投射相同 Skill 相对文件 inventory，同时 MUST 只让拥有对应 publication profile 的 adapter 消费 vendor extension。

#### Scenario: 所有 adapter 保留 vendor extension
- **WHEN** Skill 源目录包含 `agents/openai.yaml` 或其他普通随附文件
- **THEN** 每个 filesystem Skills adapter MUST 按相同相对路径和内容 identity 投射该文件
- **AND** 非 OpenAI adapter 对文件的保留 MUST NOT 被解释为支持或消费 OpenAI metadata

### Requirement: Adapter 声明 user 与 workspace Skills discovery inventory
Supported runtime adapter MUST 声明 user/workspace destination roots、可观测发现 roots、inventory evidence 和 activation 行为，使 Buildr 能在写入前检查 Buildr 管理候选 Skill 的有效发现集合，并将不可枚举来源表达为 assurance metadata 而不是 runtime 健康 finding。

#### Scenario: Adapter 完整声明 destination roots
- **WHEN** adapter 支持 workspace 和 user Skill render
- **THEN** descriptor MUST 分别声明两种 destination 的确定性 filesystem root
- **AND** MUST 声明从当前工作目录、用户、admin、system 或 plugin 中能够检查的发现来源

#### Scenario: Adapter 只能部分观察 Skills 集
- **WHEN** adapter 无法枚举一个可能参与 Agent 发现的内部来源
- **THEN** descriptor MUST 将 inventory evidence 标记为 `partial` 并列出 `opaqueSources`
- **AND** runtime check 和 doctor runtime scope MUST 在 `skillInventoryEvidence` 中保留该 assurance metadata
- **AND** ordinary doctor、render、sync 和 install MUST NOT 仅因 inventory 为 `partial` 生成 warning、actionable finding 或 repair action
- **AND** Buildr MUST NOT 宣称已经证明当前 Agent 全局无同名 Skill

#### Scenario: Destination root 不可确定
- **WHEN** adapter 无法确定 user 或 workspace destination root
- **THEN** Buildr MUST 将对应 destination 标为 unsupported
- **AND** MUST NOT 猜测目录或写入 runtime

### Requirement: Runtime plan 在统一 preflight 中治理 Skill 名称冲突
Buildr MUST 在生成任何 Skill mutation 前组合 Buildr 管理候选的 source plan、capability graph、receipts、destination inventory 和同名候选，并对 blocking conflict 保持整次零写入；与 Buildr 候选 identity 无关的 runtime Skills MUST NOT 进入冲突诊断。

#### Scenario: 候选与可观测外部 Skill 同名
- **WHEN** runtime plan 发现 Buildr 管理候选 Skill ID 与外部、plugin、system、人工或其他 workspace Skill 同名且 identity 不等价
- **THEN** plan MUST 包含冲突来源、路径或可用 provenance、digest 和 nextActions
- **AND** reconcile MUST NOT 写入任一候选 Skill 或 receipt

#### Scenario: 用户层满足 workspace 投射
- **WHEN** runtime plan 证明 user destination 已包含同一受管 asset identity 和 render digest
- **THEN** plan MUST 将 workspace candidate 标记为 `satisfied_by_user`
- **AND** checker MUST 使用 satisfaction evidence 检测后续 user projection 漂移

#### Scenario: 无关 runtime Skill 不进入诊断
- **WHEN** 可观测 runtime inventory 包含与本次 Buildr source plan 和既有受管 receipts 均无同名 identity 的外部 Skill
- **THEN** runtime plan MUST 忽略该 Skill
- **AND** doctor、render、sync 和 install MUST NOT 为该 Skill 生成冲突、warning 或 repair action

#### Scenario: 不透明来源不影响不相关候选
- **WHEN** adapter inventory 为 partial 但没有发现与 Buildr 管理候选 ID 相同的可观测 Skill
- **THEN** Buildr MAY 在保留 partial assurance metadata 后继续投射
- **AND** MUST NOT 将该结果描述为顶层 Skill 路由无歧义已证明

### Requirement: Runtime projection 必须提供 execution binding 与条件式 activation expectation
Buildr runtime adapter plan 与公开 runtime evidence MUST 提供 task environment 可消费的 adapter identity、runtime source root、projection identity 和 Rules/Skills activation metadata。projection identity MUST 参与普通 execution binding；session activation evidence MUST 只在 runtime discovery、loading、activation mode、投射路径或相关 metadata 发生变化且专项验收明确要求 activation proof 时检查。普通 Rule/Skill 内容修改 MUST NOT 因 Skills activation mode 为 `session-start` 而要求新 session。公开 evidence MUST 描述 Buildr 可证明的投射事实，不得声称目标 Agent 已在当前 session 加载 runtime。

#### Scenario: Session-start Skills 已投射到 task checkout
- **WHEN** Buildr 为 task environment 成功投射一个 Skills activation 为 `session-start` 的 runtime
- **THEN** runtime evidence MUST 返回 runtime source root、projection identity 与 activation metadata
- **AND** 普通 proposal、implementation、verification 与 finish MUST NOT 等待 session adoption evidence

#### Scenario: Runtime projection identity 改变
- **WHEN** task environment 的 sync/render 改变了影响 Rules 或 Skills discovery 的 projection identity
- **THEN** runtime evidence MUST 使既有 execution binding 失效
- **AND** 只有当前专项验收要求 activation proof 时，既有 activation receipt 才 MUST 同时可被识别为 stale

#### Scenario: Filesystem 无法证明 session consumption
- **WHEN** runtime check 只能证明投射内容与期望状态一致
- **THEN** result MUST 报告 projection ready 与 session consumption unknown
- **AND** MUST NOT 仅凭文件存在、content identity 或 checker success 报告 session adopted

### Requirement: Codex runtime evidence 必须保持 path-read 与 session-start 边界
Codex adapter MUST 继续将 Rules activation 声明为 `path-read`、Skills activation 声明为 `session-start`，并 MUST 将 activation guidance 标记为条件式验收信息，而不是普通 task environment readiness 门禁。

#### Scenario: Codex task environment runtime 准备完成
- **WHEN** checkout-local Codex runtime 已通过 sync 与 doctor
- **THEN** Buildr MUST 报告 Rules 和 Skills 各自的 activation mode、runtime source root 与 projection identity
- **AND** 只有验收明确要求证明 checkout-local Skills 已被 Agent 激活时，才 MUST 请求 host 可提供的 reload/session evidence；无法绑定既有 environment 时 MUST 如实报告缺口
