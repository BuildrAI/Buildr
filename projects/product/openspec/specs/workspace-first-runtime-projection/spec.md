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
- **THEN** 用户 MUST 能通过自然语言让智能体（Agent）依据 Buildr 产品说明和当前命令帮助安装、初始化或恢复 Buildr 技能（Skill），并继续使用工作空间（Workspace）资产

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
- **THEN** Buildr MUST 支持标准适配器（Adapter）`agents-standard`，并将 `codex`、`dsh` 及没有专用例外的有效运行时标识解析到标准；`claude-code` 等已知专用接入继续使用专用实现
- **AND** Buildr MUST 清楚报告非法运行时标识或显式不存在的适配器（Adapter），且不得修改 runtime 文件

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
- **THEN** Agent MUST 先读取 适用的 `AGENTS.md`，其根受管区块包含核心规则
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
- **AND** required block MUST 内联随包核心规则正文，并保留区块外用户内容

#### Scenario: Adapter 格式转换
- **WHEN** 某个 Agent 需要特殊 include 格式
- **THEN** 对应 adapter MUST 在 runtime render 阶段转换
- **AND** Buildr 源资产 MUST NOT 把 Claude Code 的 `@` 当作通用语义

### Requirement: Agent runtime adapter discovery
Buildr MUST 提供 Agent-readable 的方式，用于发现已支持的 Agent runtime adapter、每个 adapter 实现的 render 能力、组合 traits 以及 Rules source discovery semantics。

#### Scenario: Agent lists supported runtime adapters
- **WHEN** Agent 运行 `buildr runtime list --json`
- **THEN** Buildr MUST 输出静态适配器（Adapter）、默认 `agents-standard`、已知运行时映射和未知有效运行时采用标准的选择规则
- **AND** 输出 MUST 区分品牌 `runtimeId` 与文件 `adapterId`，并说明标准文件准备不代表品牌安装或会话加载已验证
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
- **THEN** Buildr MUST 保留真实 runtime identity，并允许多个运行时共享同一标准 adapter identity、文件契约和测试；品牌特有发现与激活事实单独表达
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
Buildr MUST 区分未知运行时品牌、非法运行时标识和显式不存在的适配器（Adapter）；未知有效品牌不等于无法生成标准文件。

#### Scenario: Unsupported Agent runtime is discovered
- **WHEN** 调用方传入未登记但语法有效的运行时标识且没有显式适配器（Adapter）选择
- **THEN** Buildr MUST 保留该运行时身份并使用 `agents-standard`
- **AND** MUST 允许 render、sync、skill install、runtime check 和 doctor 的标准文件操作
- **AND** MUST 将品牌安装、发现与会话加载标记为未确认，而不是已验证支持

#### Scenario: Unsupported Agent guidance in runtime list
- **WHEN** 调用方查看 `runtime list --json`
- **THEN** MUST 说明未知有效品牌采用标准默认，以及显式未知适配器（Adapter）和执行失败不会回退

#### Scenario: 显式无效适配器
- **WHEN** 调用方显式选择不存在的适配器（Adapter），或运行时标识语法非法
- **THEN** Buildr MUST 在写入前报错而不选择默认值

#### Scenario: 选择结果发生执行错误
- **WHEN** 已选标准或专用实现出现冲突、缺失或执行失败
- **THEN** Buildr MUST 保留原选择和错误事实，不以另一实现重试或改写另一套目录

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
Buildr 必读核心规则（required Core）MUST 要求智能体（Agent）面向用户说明或回复产品设计、实现、问题、方案、进度或结果时，使用直接、简练、易于理解的表达；专业术语每次出现都使用统一的中英文对照，并准确处理必须对应实现的文本和有助于降低理解歧义的 Mermaid 可视化。

#### Scenario: Agent 说明方案或结果
- **WHEN** 智能体面向用户说明或回复产品设计、实现、问题、方案、进度或结果
- **THEN** 智能体 MUST 优先使用用户容易理解的直接、简练表达
- **AND** 智能体 MUST 只在准确表达所必需时使用专业术语

#### Scenario: 专业术语只使用中文
- **WHEN** 智能体准备只用中文名称或中文释义表达专业术语
- **THEN** 智能体 MUST 同时提供对应英文原词
- **AND** 智能体 MUST 使用“中文（English Term）”形式
- **AND** 智能体 MUST NOT 单独使用中文专业术语
- **AND** 同一描述范围内 MUST 保持中文名称、英文原词和概念边界一致

#### Scenario: 已有中文名称的专业术语首次出现
- **WHEN** 智能体在面向用户的说明或回复中首次使用已有中文名称的专业术语
- **THEN** 智能体 MUST 同时提供对应中文名称或中文含义和英文原词
- **AND** 智能体 MUST 使用“中文（English Term）”形式
- **AND** 智能体 MUST NOT 单独使用中文或英文专业术语

#### Scenario: 英文专业术语后续再次出现
- **WHEN** 智能体在同一说明或回复中再次使用已经解释过的专业术语
- **THEN** 智能体 MUST 再次使用“中文（English Term）”形式
- **AND** 智能体 MUST NOT 因该术语此前已经解释而省略中文名称或英文原词

#### Scenario: 专业术语没有稳定中文译名
- **WHEN** 面向用户的英文专业术语没有稳定中文译名
- **THEN** 智能体 MUST 使用能够说明其含义的准确中文表述
- **AND** 智能体 MUST 使用“中文释义（English Term）”形式，不得省略中文释义或英文原词

#### Scenario: 文本必须精确对应实现
- **WHEN** 命令、代码标识、字段名、接口名、文件路径、错误原文、产品专名或其他文本必须与实现精确对应
- **THEN** 智能体 MUST 保留需要精确对应的英文原文
- **AND** 智能体将该文本作为专业概念向用户说明时 MUST 使用“中文（English Term）”或“中文释义（English Term）”形式
- **AND** 用户可见标签或说明 MUST NOT 使用英文原文代替中文或中英文并列的专业称谓

#### Scenario: 复杂关系适合图示
- **WHEN** 输出环境支持 Mermaid，且关系、时序、分支或状态转换用文字不易准确理解
- **THEN** 智能体 MUST 使用 Mermaid 表达该结构
- **AND** 智能体 MUST 用一句话说明图表的关键结论

#### Scenario: 简单线性内容不需要图示
- **WHEN** 内容可以用简短文字或表格准确表达
- **THEN** 智能体 MUST 使用文字或表格
- **AND** 智能体 MUST NOT 仅为展示形式而增加 Mermaid 图表

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
- **THEN** adapter descriptor MUST 包含稳定且唯一的 adapter id、完整 traits、全部 required render capabilities、runtime targets、实现入口和 Agent-readable metadata
- **AND** `runtime list`、CLI 参数校验、render、sync、Skill install、runtime check 和 doctor MUST 从同一组合后 registry descriptor 解析该 adapter

#### Scenario: Adapter contract 不完整
- **WHEN** registered adapter 缺少任一 required trait、required capability、实现入口或必要 capability evidence
- **THEN** package verification MUST fail
- **AND** Buildr MUST NOT 将该 adapter 报告为 supported

#### Scenario: 未注册 runtime
- **WHEN** Agent 请求一个不在静态 registry 中的 runtime id
- **THEN** Buildr MUST 保留该 runtime id 并由统一选择规则采用 `agents-standard`
- **AND** Buildr MUST NOT 将其冒充为另一品牌；显式选择未知 adapter id MUST 继续报错

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
Buildr MUST 允许不同静态 adapter 组合受约束的 Rules、Skills、surface、activation 和 checker traits，同时保持每个 runtime 的真实 identity 与诊断归因，并允许共享文件契约。

#### Scenario: Rules trait 分类
- **WHEN** adapter 声明 Rules trait
- **THEN** trait kind MUST 是 `native-recursive`、`native-root`、`reference-bridge` 或 `vendor-rule-files` 之一
- **AND** `native-root` 或其他部分原生行为 MUST NOT 在没有完整 scope projection implementation 时认证 `rules-entry`

#### Scenario: Skills、surface 与 activation trait 分类
- **WHEN** adapter 声明非 Rules traits
- **THEN** Skills kind MUST 是 `agents-compatible` 或 `vendor-root`
- **AND** surface kind MUST 是 `ide`、`cli`、`desktop` 或 `cloud`
- **AND** Rules 和 Skills activation MUST 分别声明为 `immediate`、`path-read`、`session-start`、`explicit-reload` 或表示宿主行为未确认的 `host-dependent`
- **AND** `explicit-reload` MUST 提供 Agent-readable reload guidance

#### Scenario: 两个 runtime 复用相同布局
- **WHEN** 两个 registered adapters 使用相同 Rules implementation 或 Skills layout
- **THEN** 它们 MAY 复用同一个内置投射 primitive
- **AND** 不同文件约定的 adapter MUST 继续拥有独立 descriptor 和 contract tests；相同标准的多个 runtime MUST 共享标准 adapter，品牌行为差异作为附加事实
- **AND** Buildr MUST NOT 将其中一个 runtime id 解析为另一个 runtime id

#### Scenario: 验证 adapter 扩展点
- **WHEN** package tests 使用 fake adapter 验证新增 adapter 的集成路径
- **THEN** fake adapter MUST 只能通过测试注入点使用
- **AND** fake adapter MUST 能验证 trait composition、implementation dispatch 和 capability validation
- **AND** 发布的 `runtime list`、CLI help 和 package registry MUST NOT 将 fake adapter 报告为 supported

### Requirement: 现有 supported runtime 迁移保持兼容
Buildr MUST 在采用统一 adapter contract 后保持 `codex`、`dsh` 和 `claude-code` 的公开命令、runtime targets、managed ownership、冲突和清理语义兼容。

#### Scenario: Codex parity
- **WHEN** Buildr 使用 `agents-standard` adapter render 或 check 相同 workspace 状态，且调用方身份为 `codex`、`dsh` 或其他有效运行时身份
- **THEN** Buildr MUST 保持 native `AGENTS.md`、`.agents/skills/`、Skill install plans、managed marker 和 doctor 结果的既有语义
- **AND** Buildr MUST 保留调用方提供的运行时身份，不把结果改写为 `agents-standard`

#### Scenario: Claude Code parity
- **WHEN** Buildr 使用 `claude-code` adapter render 或 check 相同 workspace 状态
- **THEN** Buildr MUST 保持同目录 `CLAUDE.md` reference bridges、`.claude/skills/`、Skill install plans、managed marker 和 doctor 结果的既有语义

#### Scenario: 重复同步保持幂等
- **WHEN** 任一 supported adapter 在源资产与目标状态不变时连续同步两次
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

### Requirement: Adapter descriptor 声明可选 Skill publication extensions
Buildr MUST 允许静态文件适配器（Adapter）或品牌附加描述声明受约束、静态且可验证的可选发布扩展；标准文件约定 MUST 不机械消费任何品牌元数据。包验证 MUST 从相同声明派生校验，通用资产仍覆盖所有已知适用品牌扩展。

#### Scenario: Codex 发布 OpenAI Skill metadata
- **WHEN** 面向 `codex` runtime 发布的 package Skill 包含 `agents/openai.yaml`
- **THEN** Codex 品牌附加描述 MUST 校验该文件的 OpenAI metadata，而非要求存在独立 Codex 文件适配器（Adapter）
- **AND** 校验失败 MUST 标识 Skill id、无效字段和对应扩展

#### Scenario: Codex Skill 没有 OpenAI UI 扩展
- **WHEN** 面向 `codex` runtime 发布的 package Skill 没有 `agents/openai.yaml`
- **THEN** 标准入口 MUST 继续以 `SKILL.md` 的 `name` 和 `description` 表达该技能（Skill）
- **AND** package verification 和 render MUST NOT 因扩展缺失失败或生成该文件

#### Scenario: 非 OpenAI adapter 不消费 OpenAI metadata
- **WHEN** 文件约定和真实品牌均未声明 OpenAI publication extension
- **THEN** MUST 保留但不解释 `agents/openai.yaml`
- **AND** MUST NOT 因该文件缺失而判定发布失败，或把文件解释为自身激活、路由或界面元数据

#### Scenario: Adapter publication extension 不安全或未知
- **WHEN** 文件适配器（Adapter）声明绝对路径、逃逸路径、重复 extension 或不受支持的元数据格式
- **THEN** adapter descriptor validation MUST fail
- **AND** Buildr MUST NOT 将该文件实现报告为 supported

### Requirement: 完整 Skill 投射区分保留与消费
Buildr MUST 让所有 filesystem Skills adapters 保真投射相同 Skill 相对文件 inventory，同时 MUST 只让拥有对应文件或品牌附加 profile 的上下文消费 vendor extension。

#### Scenario: 所有 adapter 保留 vendor extension
- **WHEN** Skill 源目录包含 `agents/openai.yaml` 或其他普通随附文件
- **THEN** 每个 filesystem Skills adapter MUST 按相同相对路径和内容 identity 投射该文件
- **AND** 非 OpenAI 上下文对文件的保留 MUST NOT 被解释为支持或消费 OpenAI metadata

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

### Requirement: Runtime projection必须提供可即时核对的identity与条件式activation expectation
Buildr runtime adapter plan与公开runtime evidence MUST提供adapter identity、runtime source root、projection target/root、projection identity和Rules/Skills activation metadata。具体调用方在使用前即时核对这些事实；真实Agent session activation evidence只在runtime discovery、loading、activation mode、投射路径或相关metadata发生变化且专项验收要求时由Task Verification持有。普通Rule/Skill内容、contract或description修改 MUST NOT因Skills activation mode为`session-start`而要求新session。

#### Scenario: Session-start Skills已投射到验证工作根
- **WHEN** Buildr为Agent核对的验证工作根成功投射一个Skills activation为`session-start`的runtime
- **THEN** runtime evidence MUST 返回 runtime source root、target root、projection identity 与 activation metadata
- **AND** 普通proposal、implementation、verification或finish MUST NOT等待session adoption evidence

#### Scenario: 候选 source 投射自身验证根
- **WHEN** candidate Product source把自己的隔离验证工作根作为target
- **THEN** runtime guard MUST 允许 workspace-scoped projection 和验证根内隔离模拟 user destination
- **AND** evidence MUST 明确这是候选验证投射，不是 retained runtime 或真实共享用户 runtime 已生效

#### Scenario: 候选 source 请求越界 target
- **WHEN** candidate Product source 请求写入 retained Workspace、peer task worktree 或 Task Validation Workspace 之外的共享 user runtime
- **THEN** runtime guard MUST 在任何写入前 fail closed
- **AND** MUST 返回 candidate source、允许根和越界 target identity

#### Scenario: Runtime projection identity 改变
- **WHEN** Task Validation Workspace 的 sync/render 改变了影响 Rules 或 Skills discovery 的 projection identity
- **THEN** 调用方 MUST在下一次使用前重新核对runtime projection
- **AND** 只有当前专项验收要求 activation proof 时，Task Verification 中既有 session evidence 才 MUST 同时失效

#### Scenario: Filesystem 无法证明 session consumption
- **WHEN** runtime check 只能证明投射内容与期望状态一致
- **THEN** result MUST 报告 projection ready 与 session consumption unknown/not-applicable
- **AND** MUST NOT仅凭文件存在、content identity或checker success报告session adopted

### Requirement: Codex runtime evidence 必须保持 path-read 与 session-start 边界
Codex adapter MUST继续将Rules activation声明为`path-read`、Skills activation声明为`session-start`，并 MUST将activation guidance标记为Task Verification的条件式验收信息。Buildr MUST NOT保存session handle、adoption mode或统一activation结论。

#### Scenario: Codex 任务验证工作区 runtime 准备完成
- **WHEN** checkout-local Codex runtime 已在 Task Validation Workspace 通过 sync 与 doctor
- **THEN** Buildr MUST 报告 Rules/Skills activation mode、runtime source root、target root 与 projection identity
- **AND** 普通调用方 MUST不要求当前会话重新加载Skill

#### Scenario: Codex 专项验收需要真实采用
- **WHEN** 变更影响 Codex Skills discovery/session-start loading/投射机制，且 P0.4 验收明确要求真实 Agent session proof
- **THEN** Task Verification MUST绑定source/projection/session identity记录实际evidence或如实缺口
- **AND** 普通workflow MUST NOT因无法把新session绑定到既有worktree而伪造adoption或创建第二份checkout

### Requirement: candidate runtime identity 必须同时约束 runtime projection 与 Structured Store mutation
自举 candidate source 的 runtime identity guard MUST 区分纯 runtime projection 与完整 Workspace source sync，并一致约束 runtime projection、Workspace source asset 与 Structured Store mutation。候选 source MAY 向自身 task checkout 执行不包含 source/store mutation 的 projection-only render，也 MAY 向无关的独立验证 Workspace 执行完整 sync；同一 Git common-dir 的 retained Workspace、peer task worktree与验证根外共享 runtime MUST 在任何写入前被拒绝。linked candidate 对自身源码 checkout 调用 `sync` 时，产品 MUST 在 Workspace 初始化与 source/store mutation 前把操作收敛为包含产品 Skill 的 projection-only render，而不是执行完整 sync 或因旧 retained controller 调用而阻断候选验证。

#### Scenario: candidate runtime 使用验证根
- **WHEN** candidate source 对自身 linked task checkout 执行包含 Rule、workspace Skill 与产品入口 Buildr Skill 的 projection-only render
- **THEN** runtime guard MUST 允许该投射并返回候选验证 provenance evidence
- **AND** MUST NOT 迁移 Structured Store、同步 Project registry、package builtin 或 Component source asset
- **AND** evidence MUST NOT 宣称 retained runtime 或 canonical data 已生效

#### Scenario: candidate runtime 在独立验证 Workspace 执行完整 sync
- **WHEN** candidate source 把不属于同一 Git common-dir checkout 的独立验证 Workspace 作为完整 sync target
- **THEN** runtime guard MUST 允许该隔离 mutation
- **AND** evidence MUST NOT 宣称 retained runtime 或 canonical data 已生效

#### Scenario: linked candidate 对自身源码执行完整 sync
- **WHEN** linked candidate Product source 请求以自身 checkout 为 target 执行完整 sync
- **THEN** 产品 MUST 在 Workspace 初始化、plan、migration 与 source asset mutation 前把该调用收敛为包含产品 Skill 的 projection-only render
- **AND** MUST 返回 caller、target、实际 projection-only disposition、推荐 render 命令与独立验证 Workspace 指引
- **AND** MUST NOT因retained工具版本变化而阻断候选projection

#### Scenario: candidate runtime 目标越界
- **WHEN** candidate source 请求写入 retained Workspace runtime、canonical Structured Store、peer task worktree 或验证根外共享 user runtime
- **THEN** guard MUST 在首个相关 mutation 前 fail closed
- **AND** diagnostic MUST 区分 caller identity、允许 validation boundary 与被拒绝 target identity

#### Scenario: retained source 保持正常同步
- **WHEN** retained Product source 对 canonical Workspace 执行完整 sync，或为 task worktree 执行 runtime projection
- **THEN** runtime guard MUST 保持既有合法行为
- **AND** MUST NOT要求Task Record作为普通sync/render的前置权限

### Requirement: Skill 投射所有权回执使用 Buildr destination 控制状态根
Buildr MUST 将 Skill 投射所有权回执与 Agent 实际消费的 runtime root 分离，并 MUST 使用 destination-aware 的 Buildr 控制状态路径作为唯一 canonical authority。

#### Scenario: Workspace Skill 投射回执路径
- **WHEN** Buildr 为 文件归属 `<adapter>` 的 workspace destination 投射 runtime path `<runtime-path>`
- **THEN** 回执 MUST 写入 `<workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json`
- **AND** 实际 Skill MUST 继续写入 adapter 声明的 workspace Skills root

#### Scenario: User Skill 投射回执路径
- **WHEN** Buildr 为 文件归属 `<adapter>` 的 user destination 投射 runtime path `<runtime-path>`
- **THEN** 回执 MUST 写入 `<user-home>/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json`
- **AND** 实际 Skill MUST 继续写入 adapter 声明的 user Skills root

#### Scenario: User home 同时是 Workspace
- **WHEN** workspace root 与 user home 指向同一目录
- **THEN** workspace 与 user 回执 MUST 仍由路径中的 `workspace` 和 `user` 分段保持隔离
- **AND** 任一 destination 的 render MUST NOT 覆盖另一 destination 的回执

#### Scenario: 相同标准 Skills root 共用归属
- **WHEN** 多个运行时或专用规则（Rule）适配器（Adapter）使用相同 `.agents/skills/` 目录
- **THEN** 其技能（Skill）回执 MUST 统一使用 `agents-standard` 归属，而非品牌身份
- **AND** 专用规则（Rule）的选择与维护 MUST 保持独立
- **AND** 切换品牌但来源与有效内容相同时 MUST 幂等，不产生第二份归属

### Requirement: 旧 runtime-root 回执受控迁移到 canonical 路径
Buildr MUST 只把旧 adapter runtime root 中的有效投射回执作为一次性迁移输入，并 MUST 在迁移后维持单一 canonical authority。

#### Scenario: 只有有效旧回执
- **WHEN** canonical 回执缺失、legacy 回执 schema 与 identity 有效且其文件 inventory 仍匹配 runtime
- **THEN** 下一次适用 mutation MUST 在同一受管 transaction 中写入 canonical 回执并删除 legacy 回执
- **AND** transaction 失败 MUST 恢复操作前状态

#### Scenario: 新旧回执内容等价
- **WHEN** canonical 与 legacy 回执同时存在且 identity、digest 与 inventory 等价
- **THEN** Buildr MUST 保留 canonical 回执并受控删除 legacy 回执
- **AND** MUST NOT 改写未变化的 runtime Skill 文件

#### Scenario: 新旧回执发生冲突
- **WHEN** canonical 与 legacy 回执的 identity、digest 或 inventory 不一致
- **THEN** Buildr MUST 在写入任何计划目标前报告 ownership conflict
- **AND** Buildr MUST 保留两份回执和全部 runtime 文件

#### Scenario: 旧回执无法证明 runtime ownership
- **WHEN** legacy 回执无效或其登记文件不再匹配 runtime
- **THEN** Buildr MUST 保留现场并阻塞自动迁移、更新和清理
- **AND** Buildr MUST NOT 通过长期双读或目录内容推断取得 ownership

### Requirement: 平级服务与代码库规则作用域
规则发现 MUST 支持 `services/<code>` 与 `repositories/<code>` 及其子目录，沿实际目录读取组织根及局部规则；项目引用不自动建立唯一父项目规则链。

#### Scenario: 共享代码规则
- **WHEN** 多个项目服务引用同一代码库实例
- **THEN** 规则发现 MUST 保持代码库真实祖先规则，任务所需项目规则由明确上下文选择，不合并所有引用方

#### Scenario: 路径边界
- **WHEN** 规则作用域穿越工作空间或符号链接
- **THEN** 系统 MUST 拒绝相关访问，不降低原有路径保护

### Requirement: 标准默认选择保留已有接入事实
Buildr MUST 使用同一选择规则处理初始化、同步、投射、检查和组件维护，并分别表达请求运行时身份与实际适配器（Adapter）。

#### Scenario: 标准品牌与默认值
- **WHEN** 调用方传 `codex`、`dsh`，或没有既有接入事实且未指定运行时
- **THEN** Buildr MUST 选择 `agents-standard`
- **AND** 未指定身份时 MUST 保持身份未知，不伪造 `codex` 或 `dsh`

#### Scenario: 退役品牌的运行时身份
- **WHEN** 调用方传 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 或其他有效运行时身份
- **THEN** Buildr MUST 保留该身份，并选择 `agents-standard` 作为文件投射适配器
- **AND** MUST NOT 因该身份报错，也 MUST NOT 将其报告为独立 supported adapter

#### Scenario: 保留已有专用接入
- **WHEN** 调用方没有指定运行时或适配器（Adapter），且现场存在唯一既有受管接入方式
- **THEN** Buildr MUST 保留该方式
- **AND** 多个不等价选择存在时写入 MUST 请求明确选择，不静默切换为标准

#### Scenario: 显式覆盖
- **WHEN** 调用方传入有效 `--adapter`
- **THEN** Buildr MUST 采用该明确文件约定，保留请求运行时身份
- **AND** 显式选择不授权接管任何外部文件

#### Scenario: 无效 adapter id
- **WHEN** 调用方传入不支持的 `--adapter` 值
- **THEN** Buildr MUST 明确失败并报告当前支持的 adapter id
- **AND** MUST NOT 静默回退到标准适配器或其他品牌

#### Scenario: 运行时身份不按适配器标识解析
- **WHEN** 调用方以运行时身份调用受管命令（`render`、`sync`、`runtime check`、`skills render`、`skill install`）
- **THEN** Buildr MUST 按选择规则把该身份解析为实际适配器，MUST NOT 把运行时身份当作适配器标识直接查找
- **AND** 身份缺失时 MUST 记为未指定，MUST NOT 把紧随其后的选项当成身份

### Requirement: 共享标准投射迁移保持归属与内容安全
Buildr MUST 只从有效旧受管证据迁移品牌回执或多层技能（Skill）目录，在写入前检查完整文件、路径和所有权；不能仅凭生成标记覆盖内容。

#### Scenario: 有效旧回执与嵌套目录
- **WHEN** 旧品牌回执能证明来源身份、目标完整字节与权限且新目标安全
- **THEN** Buildr MUST 在同一受管操作中生成共享回执与标准一级目录，并移除已证明的旧受管文件和回执
- **AND** 失败 MUST 恢复本次操作前状态

#### Scenario: 漂移或多份证据不一致
- **WHEN** 旧内容已被用户修改、含未知额外文件、新旧回执不一致、来源身份不同或目标冲突
- **THEN** Buildr MUST 保留文件及证据，并在写入任何候选目标前报告冲突

#### Scenario: 运行时限制与共享内容不同
- **WHEN** 不同运行时的明确适用范围导致同一共享技能（Skill）具有不同能力绑定或正文
- **THEN** Buildr MUST 显式报告共享内容冲突，不采用最后一次写入获胜
- **AND** 当前运行时未选择的、仍有启用来源的共享技能（Skill）MUST NOT 被当作孤儿删除

### Requirement: 标准 Agent runtime 协议是唯一默认支持面
Buildr MUST 只把标准 `AGENTS.md` 规则协议与 `.agents/skills/` 技能协议作为默认支持的运行时接入面；MUST NOT 把任何品牌的目录约定、规则文件格式或技能根作为产品默认支持面。专有实现 MUST 属于例外，只有存在可审计的宿主原生能力缺口证据、且已独立立项时才 SHALL 注册为 supported adapter。

#### Scenario: 标准适配器是默认解析结果
- **WHEN** 调用方提供 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy`、`codex`、`dsh` 或其他有效运行时身份，且未显式选择例外适配器
- **THEN** Buildr MUST 使用 `agents-standard` 作为文件投射适配器，并保留调用方提供的运行时身份
- **AND** MUST NOT 为该身份注册、借用或报告品牌专用适配器

#### Scenario: 注册专有例外必须有宿主原生能力缺口证据
- **WHEN** 维护者提议把某个品牌注册为独立的 supported adapter
- **THEN** 提议 MUST 附带可审计的宿主原生能力缺口证据，说明标准 `AGENTS.md` 协议或 `.agents/skills/` 协议为何不能服务该宿主
- **AND** 缺少该证据时 Buildr MUST NOT 注册该适配器

#### Scenario: 已注册例外只填补缺口
- **WHEN** Buildr 报告当前 supported adapters
- **THEN** 结果 MUST 只包含 `agents-standard` 与已附缺口证据的例外适配器
- **AND** 每个例外 MUST 只为该缺口实现投射，MUST NOT 为标准协议已覆盖的语义重复实现完整内容副本

### Requirement: 退役适配器的既有投射按所有权证明清理
Buildr MUST 在适配器退役后处理其既有投射，而不是让其留在磁盘上失去归属。处理 MUST 幂等；MUST 只删除能证明属于 Buildr 的文件；MUST 在无法证明所有权时保留文件并报告；MUST 在无法安全分离时整组零写入并保持可回滚。

#### Scenario: 可证明所有权的退役投射
- **WHEN** 退休适配器的规则桥、技能镜像或状态命名空间可由 Buildr 受管标记或所有权回执证明属于 Buildr
- **THEN** Buildr MUST 在受管操作中删除这些文件与对应回执
- **AND** 重复执行同一范围的退役处理 MUST 不新增、更新或误删文件

#### Scenario: 所有权无法证明
- **WHEN** 内容已漂移、含未知额外文件、缺少回执或来源身份不一致
- **THEN** Buildr MUST 保留文件，并在退役报告或 doctor 中说明具体路径与原因
- **AND** MUST NOT 猜测所有权或静默删除

#### Scenario: 退役目标与用户内容共存
- **WHEN** 退休目标路径同时包含 Buildr 受管内容与用户内容
- **THEN** Buildr MUST 只移除可证明属于 Buildr 的部分并保留用户内容
- **AND** 无法安全分离时 MUST 整组零写入并报告冲突

### Requirement: DSH 运行时身份与投射保持分层证据
Buildr 的 DSH 接入 SHALL 保留真实运行时标识（Runtime ID）`dsh`，并把规则（Rule）与技能（Skill）投射交由共享的标准适配器（Standard Adapter）`agents-standard` 承担；MUST NOT 新增独立 `dsh` 适配器（Adapter），也 MUST NOT 借用其他产品的供应商适配器身份。DSH 特有的插件（Plugin）交付维护 SHALL 独立于适配器层。只有规则入口、产品技能（Skill）、工作空间与项目技能（Skill）、安装计划和运行时检查五项现有能力均有明确实现与证据时，才 SHALL 将 DSH 报告为受支持运行时（Runtime）。

#### Scenario: 仅完成桌面入口
- **WHEN** DSH 中 Buildr 按钮可见或插件（Plugin）安装成功，但尚未验证规则（Rule）与技能（Skill）发现
- **THEN** Buildr MUST 将结果限定为桌面入口或插件（Plugin）交付
- **AND** MUST NOT 将其报告为完整运行时（Runtime）接入

#### Scenario: 发现路径受限
- **WHEN** DSH 实际发现目录、作用域或刷新语义不能表达现有 Buildr 源资产
- **THEN** 系统 MUST 明确相关支持缺口，不得静默忽略技能（Skill）或退回供应商专用格式
- **AND** 缺口 MUST 只影响相关接入，不否定其他已验证能力

### Requirement: DSH 插件交付维护独立于适配器
DSH 插件（Plugin）交付与维护协调 SHALL 作为 DSH 特有的产品能力维护；插件（Plugin）SHALL 只负责界面动作与右侧导航，Buildr SHALL 继续拥有启动、安装身份、健康查询和业务数据。适配器（Adapter）层采用共享标准适配器时，本能力 MUST NOT 依赖新增独立适配器身份。

#### Scenario: 安装与升级
- **WHEN** 已授权安装或更新 Buildr 的 DSH 插件（Plugin）
- **THEN** 交付 MUST 使用 DSH 受支持管理入口并遵守精确版本兼容与依赖构建授权
- **AND** MUST NOT 直接运行包管理器改写桌面版受管配置
- **AND** MUST 保持插件（Plugin）源资产由 Buildr 产品工程维护，不以修改本机安装副本替代正式交付

#### Scenario: 受支持自动路径缺失
- **WHEN** DSH 没有可调用的安装或维护路径
- **THEN** Buildr MUST 报告具体缺失能力和已验证的人工管理入口
- **AND** MUST NOT 伪造自动安装或将本机单次安装报告为正式接入完成

#### Scenario: 退出不影响业务数据
- **WHEN** 禁用或卸载 DSH 插件（Plugin）
- **THEN** Buildr MUST 保持安装与业务数据不被删除
- **AND** MUST NOT 擅自停止已经运行的 Buildr Web

### Requirement: runtime 命令省略位置身份时分派保持参数完整
Buildr runtime 命令（`render`、`sync`、`runtime check`、`skill install`、`skills render`、`rules render`）的位置运行时身份 MUST 可选。CLI 分派 MUST NOT 把以 `--` 开头的参数或其值读作位置身份或命令词；省略身份时该槽位 MUST 为 `null`，全部选项与值 MUST 原样到达对应操作。省略身份或仅传 `--adapter` 时，适配器（Adapter）MUST 由同一选择规则依据 Workspace 现场证据与显式 `--adapter` 决定，MUST NOT 静默落到忽略现场证据的默认适配器。

#### Scenario: 省略身份的 skills render
- **WHEN** 执行 `buildr skills render --target <dir>`
- **THEN** `--target` 值 MUST 作为 Skill source workspace 生效
- **AND** 运行时身份 MUST 为 `null`，MUST NOT 报 `Unknown argument` 或把 `--target` 记为运行时身份

#### Scenario: 显式身份不变
- **WHEN** 执行 `buildr skills render codex --target <dir>`
- **THEN** 运行时身份 MUST 保留为 `codex`，投射适配器与参数语义与既有行为一致

#### Scenario: 省略身份的 rules render 按现场选择
- **WHEN** 在存在 `claude-code` 受管证据的 workspace 执行 `buildr rules render --target <dir>`
- **THEN** MUST 按同一选择规则选择 `claude-code` 适配器并执行 rules render
- **AND** 当现场只解析出原生消费 `AGENTS.md` 的适配器且无显式选择时，MUST 以非零退出说明该适配器不执行 rules render

#### Scenario: 显式 `--adapter` 不要求位置身份
- **WHEN** 执行 `buildr rules render --adapter claude-code --target <dir>` 或 `buildr runtime check --adapter claude-code --target <dir>`
- **THEN** MUST 使用 `claude-code` 适配器执行对应操作，MUST NOT 因省略位置身份而改选默认适配器

#### Scenario: 省略身份的 sync 与 skill install
- **WHEN** 执行 `buildr sync --target <dir>` 或 `buildr skill install --target <dir>`
- **THEN** 运行时身份 MUST 为 `null`，`--target` 值 MUST 生效
- **AND** 适配器 MUST 由同一选择规则决定
