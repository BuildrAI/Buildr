## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 标准默认选择保留已有接入事实
Buildr MUST 使用同一选择规则处理初始化、同步、投射、检查和组件维护，并分别表达请求运行时身份与实际适配器（Adapter）。

#### Scenario: 标准品牌与默认值
- **WHEN** 调用方传 `codex`、`dsh`，或没有既有接入事实且未指定运行时
- **THEN** Buildr MUST 选择 `agents-standard`
- **AND** 未指定身份时 MUST 保持身份未知，不伪造 `codex` 或 `dsh`

#### Scenario: 保留已有专用接入
- **WHEN** 调用方没有指定运行时或适配器（Adapter），且现场存在唯一既有受管接入方式
- **THEN** Buildr MUST 保留该方式
- **AND** 多个不等价选择存在时写入 MUST 请求明确选择，不静默切换为标准

#### Scenario: 显式覆盖
- **WHEN** 调用方传入有效 `--adapter`
- **THEN** Buildr MUST 采用该明确文件约定，保留请求运行时身份
- **AND** 显式选择不授权接管任何外部文件

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
