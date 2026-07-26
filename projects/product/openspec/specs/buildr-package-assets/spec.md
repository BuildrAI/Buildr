# Buildr package assets 规范

## Purpose

定义 Buildr 产品随包资产、package manifest、默认 workspace baseline 和 package check 的边界。
## Requirements
### Requirement: 随包资产使用 package manifest
Buildr MUST 使用产品 root 下的 `package/manifest.yml` 声明产品随包资产、交付 target 和用户 workspace baseline。

#### Scenario: 随包资产边界
- **WHEN** Buildr 发布产品包或校验 package baseline
- **THEN** 发布包和 baseline MUST 只包含产品 root 内 `package/manifest.yml` 显式声明或引用的资产和 CLI 运行所需文件

#### Scenario: 开发资产引用随包资产
- **WHEN** Buildr 产品开发需要验证初始化或 runtime baseline
- **THEN** package manifest MAY 引用产品 root 下的 `package/` 随包资产源

#### Scenario: 默认 workspace baseline 源进入 workspace target
- **WHEN** Buildr 维护默认 workspace baseline
- **THEN** 默认 workspace 规则、workspace metadata、Git ignore 模板、命令行工具清单入口和 workspace Skills 源 MUST 位于产品 root 下的 `package/targets/workspace/`
- **AND** package manifest MUST 从 `package/targets/workspace/` 显式引用默认 workspace baseline 源

#### Scenario: 默认 Project 模板源归属 workspace projects 容器
- **WHEN** Buildr 维护默认 Project baseline 文件
- **THEN** 默认 Project 模板源 MUST 位于产品 root 下的 `package/targets/workspace/projects/`
- **AND** package manifest MUST 从 `package/targets/workspace/projects/` 显式引用默认 Project baseline 文件

#### Scenario: 随包资产不得引用开发 overlay
- **WHEN** Buildr 校验 `package/manifest.yml`
- **THEN** package baseline MUST NOT 引用产品仓根特有规则、私有业务项目、私有组织名或私有路径

#### Scenario: 通用根规则进入 workspace target 规则源
- **WHEN** Buildr 维护默认 root 工作规则
- **THEN** 通用规则 MUST 以产品 root 下 `package/targets/workspace/rules/` 中可独立维护的规则文件作为源
- **AND** package manifest MUST 显式引用允许发布的规则文件，不得默认发布整个 `rules/` 目录

### Requirement: package manifest 声明发布边界
Buildr MUST 使用 `package/manifest.yml` 声明产品随包资产 include、workspaceDirectories、workspaceFiles、projectDirectories、projectFiles、模板变量和禁止内容。

#### Scenario: package check 校验 manifest
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 manifest include 和文件映射源路径存在、模板变量完整，并报告禁止内容
- **AND** Buildr MUST 报告 `.gitkeep` 占位文件

#### Scenario: package check 校验初始化闭环
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 使用 package manifest 在临时目录执行初始化，并验证 `doctor --json` 通过

### Requirement: 初始化从 manifest 映射生成
Buildr MUST 从 `package/manifest.yml` 声明的目录和文件映射生成默认 root baseline 和项目 baseline，并确保默认 workspace 规则具备可直接指导 Agent 工作的内容质量。

#### Scenario: 渲染 root baseline
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 使用 manifest `workspaceDirectories` 和 `workspaceFiles` 生成 root 资产
- **AND** Buildr MUST 直接创建必要空目录，不通过 `.gitkeep` 占位文件表达目录意图

#### Scenario: 已有 root AGENTS 时保留组合入口
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **AND** `<dir>/AGENTS.md` 已经存在
- **THEN** Buildr MUST NOT 覆盖 `<dir>/AGENTS.md`
- **AND** Buildr MUST 补齐或修复 Buildr required block
- **AND** Buildr MUST NOT 生成 `<dir>/AGENTS.workspace.md`

#### Scenario: 新 workspace 仍生成 root AGENTS
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **AND** `<dir>/AGENTS.md` 不存在
- **THEN** Buildr MUST 将默认 workspace 规则写入 `<dir>/AGENTS.md`

#### Scenario: root baseline 不包含 ASSETS
- **WHEN** Buildr 渲染默认 root baseline
- **THEN** 模板 MUST NOT 默认生成 `ASSETS.md`

#### Scenario: root AGENTS 提供 Buildr required block
- **WHEN** Buildr 渲染默认 root `AGENTS.md`
- **THEN** 文件 MUST 包含 Buildr required block 并引用 `rules/buildr/core.md`
- **AND** Buildr workspace 基础模型和硬边界 MUST 由 Buildr Core 承载
- **AND** 场景化操作流程 MUST 由对应 Skill 承载
- **AND** 文件 MUST NOT 引用产品仓私有业务项目、私有路径或私有业务规则

#### Scenario: 默认 root baseline 不生成 README
- **WHEN** Buildr 渲染默认 root baseline
- **THEN** 模板 MUST NOT 默认生成 `README.md`

#### Scenario: 渲染 project baseline
- **WHEN** Agent 执行 `buildr project create <project>`
- **THEN** Buildr MUST 使用 manifest `projectDirectories` 和 `projectFiles` 生成项目资产

### Requirement: package manifest 声明产品内置 Agent Skills
Buildr package manifest MUST 显式声明产品随包内置 Agent Skills，并将其与 workspace target 文件映射分离。

#### Scenario: 声明 agentSkills
- **WHEN** Buildr 产品包包含内置 Agent Skill
- **THEN** `package/manifest.yml` MUST 通过专用字段声明 Skill id、源路径和适用 runtime
- **AND** 产品入口 Buildr Skill 源路径 MUST 位于 `package/targets/runtime/skills/<skill-id>/`

#### Scenario: agentSkills 不参与 init baseline
- **WHEN** Agent 执行 `buildr init`
- **THEN** manifest 中声明的产品内置 Agent Skills MUST NOT 被复制到目标 workspace `skills/` 目录
- **AND** Buildr MUST 继续只按 `workspaceDirectories` 和 `workspaceFiles` 生成 workspace baseline

#### Scenario: package check 校验内置 Agent Skills
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 manifest 声明的产品内置 Agent Skill 源路径存在
- **AND** Buildr MUST 校验该 Skill 不包含 forbidden patterns
- **AND** Buildr MUST 校验该 Skill 具备可渲染的 `SKILL.md`

#### Scenario: package check 校验 bootstrap 入口契约
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 bootstrap guide 和 Buildr Skill 满足 `package/bootstrap/contract.yml`
- **AND** bootstrap 契约 MUST 分别约束 guide 的恢复入口、Buildr Skill 的必要章节、生成后 runtime Skill 的 adapter 内容和禁用入口
- **AND** bootstrap 契约 MUST NOT 要求 bootstrap guide 覆盖 Buildr Skill 的完整资产维护细节

### Requirement: Package 顶层职责必须分离
Buildr package MUST 将维护说明、机器映射、恢复入口和交付 target 表达为不同职责。

#### Scenario: Package 维护说明与机器契约
- **WHEN** 维护者查看 `package/` 顶层
- **THEN** `package/README.md` MUST 只说明 package 的维护用途
- **AND** `package/manifest.yml` MUST 是发布边界和 source-to-target 映射的机器契约

#### Scenario: Bootstrap 恢复入口
- **WHEN** Buildr Skill 不可用且 Agent 运行 `buildr bootstrap guide`
- **THEN** Buildr MUST 从 `package/bootstrap/guide.md` 输出恢复指南
- **AND** bootstrap 资产 MUST NOT 被当作 workspace target 或 runtime target 物化

#### Scenario: Target 目录只表达交付目的地
- **WHEN** Buildr 维护 `package/targets/`
- **THEN** `package/targets/workspace/` MUST 只保存面向 workspace 的交付源
- **AND** `package/targets/runtime/` MUST 只保存直接面向 Agent runtime 的交付源

#### Scenario: 旧 package 源路径被拒绝
- **WHEN** Buildr 校验新版本 package manifest 和活动产品引用
- **THEN** Buildr MUST NOT 接受 `package/workspace/` 或 `package/agent-skills/` 作为 canonical 源路径
- **AND** 新版本 npm package MUST NOT 同时发布旧路径兼容副本

### Requirement: package baseline 支持命令行工具清单入口
Buildr package baseline MUST 支持默认 workspace 中的命令行工具清单入口。

#### Scenario: 初始化命令行工具清单入口
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 在 workspace 中创建命令行工具清单入口
- **AND** 该入口 MUST 能承载 `commands/manifest.yml` 或等价 manifest

#### Scenario: 默认命令行工具清单为空
- **WHEN** Buildr 当前没有随包提供默认外部命令行工具声明
- **THEN** `buildr init` MUST 初始化空的命令行工具清单
- **AND** 默认清单 MUST NOT 声明 Buildr 自身为工作区命令行工具资产

#### Scenario: package check 校验命令行工具清单入口
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 package manifest 声明的命令行工具清单入口可以被初始化到临时 workspace
- **AND** Buildr MUST 校验默认命令行工具 manifest 不包含私有路径、私有组织名或个人机器状态

### Requirement: package check 覆盖 manifest-backed 资产维护命令
Buildr package check MUST 验证 manifest-backed 资产维护命令不会破坏默认 workspace baseline、manifest 标准格式或 runtime 投射边界。

#### Scenario: 验证命令行工具 add/remove
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 验证 `commands add/remove` 可以在已初始化临时 workspace 中维护 `commands/manifest.yml`
- **AND** Buildr MUST 验证写回后的命令行工具条目使用 `installHint` 而不是 `install`
- **AND** Buildr MUST 验证 `commands add/remove` 不会自动安装命令行工具或写入 Agent runtime

#### Scenario: 验证 Skills add/remove
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 验证 `skills add/remove` 只维护已初始化临时 workspace 根的 `skills/manifest.yml`
- **AND** Buildr MUST 验证 Project source scope 被拒绝并返回 legacy migration guidance
- **AND** Buildr MUST 验证 `skills add --source` 装载的是完整 Skill 源目录
- **AND** Buildr MUST 验证 `skills add/remove` 不会自动写入 user 或 workspace runtime destination

#### Scenario: 验证 Rules add/remove
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 验证 `rules add/remove` 可以在已初始化临时 workspace 中维护 root `rules/manifest.yml`
- **AND** Buildr MUST 验证 `rules add` 要求非空 description
- **AND** Buildr MUST 验证 `rules add` 未传 `--path` 时默认注册 `rules/<id>.md`
- **AND** Buildr MUST 验证 `rules add` 只能注册已存在的 root Rule 文件
- **AND** Buildr MUST 验证 `rules remove` 默认删除 Rule 源文件和 manifest entry
- **AND** Buildr MUST 验证 `rules remove --keep-file` 保留 Rule 源文件、只移除 manifest entry，并可由 doctor 报告为未登记文件
- **AND** Buildr MUST 验证 `rules add/remove` 不会自动写入 Agent runtime
- **AND** Buildr MUST 验证 required Buildr Rule 不能通过 `rules remove` 删除

### Requirement: 产品 MVP 验证覆盖 manifest-backed 资产维护
Buildr 产品 MVP 验证 MUST 覆盖命令行工具、Rules 和 Skills 源资产维护命令的主要用户路径。

#### Scenario: MVP 验证新增源资产
- **WHEN** Agent 运行产品 MVP 验证脚本
- **THEN** 验证脚本 MUST 覆盖 `commands add/remove`
- **AND** 验证脚本 MUST 覆盖 `rules add/remove`
- **AND** 验证脚本 MUST 覆盖 `skills add/remove`
- **AND** 验证脚本 MUST 覆盖 add/remove 后通过 check、doctor 或 render/check 继续确认状态的路径

#### Scenario: MVP 验证边界
- **WHEN** Agent 运行产品 MVP 验证脚本
- **THEN** 验证脚本 MUST 覆盖 add/remove 要求 target 已初始化
- **AND** 验证脚本 MUST 覆盖 add/remove 不提供 `--json`
- **AND** 验证脚本 MUST 覆盖 add/remove 不硬编码特定 Agent adapter 的下一步命令

#### Scenario: 临时 workspace 端到端验收
- **WHEN** Agent 运行产品 MVP 验证脚本
- **THEN** 验证脚本 MUST 从空临时目录初始化真实 Buildr workspace
- **AND** 验证脚本 MUST 按 Workspace、Project、Service、Rules、Commands、Skills、Runtime 七类资产覆盖主要 Agent 操作路径
- **AND** 验证脚本 MUST 在每类资产关键状态变更后使用 `doctor --json` 或对应专项检查确认状态

### Requirement: 产品级总验证入口
Buildr MUST 提供一个产品级总验证入口，用于统一执行产品包检查、临时 workspace 端到端验收和 OpenSpec strict 校验。

#### Scenario: 运行产品级总验证
- **WHEN** Agent 在产品仓执行产品级总验证入口
- **THEN** 验证 MUST 运行 `./buildr package check`
- **AND** 验证 MUST 运行临时 workspace 端到端验收
- **AND** 验证 MUST 运行 `openspec validate --all --strict`
- **AND** 任一底层检查失败时总验证 MUST 失败

#### Scenario: 产品仓规则引用统一入口
- **WHEN** 产品仓上下文规则说明验证方式
- **THEN** 规则 MUST 优先指向产品级总验证入口
- **AND** 规则 MAY 保留底层分解命令，便于 Agent 定位失败阶段

### Requirement: package manifest 声明内置能力
Buildr package manifest MUST 声明可同步到用户 workspace 的产品内置 Rules、Skills、Commands 和 Skill capability contracts，并提供旧 workspace 安全采用所需的官方完整性证据。

#### Scenario: 声明内置 Rules
- **WHEN** Buildr package 包含产品内置 Rules
- **THEN** `package/manifest.yml` MUST 声明每个内置 Rule 的 id、源路径、目标路径、description 和 required 状态
- **AND** version 或 hash 元数据 MAY 声明，但不是必填

#### Scenario: 声明内置 Skills
- **WHEN** Buildr package 包含产品内置 Skills
- **THEN** `package/manifest.yml` MUST 声明每个内置 Skill 的 id、源路径、目标路径、适用 runtimes 和 required 状态
- **AND** composed Skill MUST additionally declare its `provides` and `requires` capability identities、versions and dependency modes
- **AND** version 或 hash 元数据 MAY 声明，但不是必填

#### Scenario: 发布工作能力适配 Skill
- **WHEN** Buildr package 发布 `capability-adaptation`
- **THEN** 该 Skill MUST 作为 optional 管理 Skill 随 workspace sync 投射到全部 supported runtimes
- **AND** 其 description MUST 覆盖采用内部流程、调整工作方式、修改或替换 Skill 行为等自然语言意图
- **AND** 该 Skill MUST NOT 为自身声明空洞 capability contract

#### Scenario: 声明内置 capability contracts
- **WHEN** Buildr package publishes builtin providers or consumers
- **THEN** `package/manifest.yml` MUST declare each referenced contract id、version、description and source path
- **AND** package metadata MUST identify initial default bindings without making provider Skill ids part of the contract identity
- **AND** package check MUST validate contract frontmatter、fixed semantic sections and manifest identity consistency

#### Scenario: 未声明版本的内置能力
- **WHEN** 某个内置能力未声明 version 或 hash
- **THEN** Buildr doctor MUST 仍使用安装回执检查该内置能力的精确 live 状态
- **AND** Buildr MUST NOT 仅因为没有独立 assets version 输出 warning

#### Scenario: 声明内置 Commands
- **WHEN** Buildr package 包含产品内置 Commands
- **THEN** `package/manifest.yml` MUST 声明每个内置 Command 在 `commands/manifest.yml` 中需要写入的 manifest entry
- **AND** 内置 Commands MUST 保持为声明和安装提示，不得变成自动本机安装

#### Scenario: 声明 legacy 官方完整性
- **WHEN** Buildr 需要让无回执 workspace 从受支持的旧版 Builtin 自动升级
- **THEN** package MUST 按 Builtin 身份声明对应 legacy SHA-256 完整性
- **AND** legacy 完整性 MUST 只用于证明随既有 CLI package 发布过的官方内容

#### Scenario: package check 校验内置能力
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Buildr MUST 校验已声明的内置能力源路径
- **AND** Buildr MUST 校验 forbidden patterns、必需 Skill 文件、manifest entry 结构、目标路径安全性、legacy integrity 格式及身份唯一性
- **AND** Buildr MUST validate every contract reference、initial default binding、provides/requires version and dependency mode

#### Scenario: Rules 和 Skills manifest-first
- **WHEN** Buildr package 发布内置 Rules 或 Skills
- **THEN** sync MUST 将它们登记到 `rules/manifest.yml` 或 `skills/manifest.yml`
- **AND** Buildr MUST NOT 依赖扫描裸文件决定规则、技能或 capability bindings 是否生效

#### Scenario: Rule manifest metadata
- **WHEN** Buildr 创建、安装或更新 Rule manifest entry
- **THEN** entry MUST 声明 `id`、`source`、`path`、`description`、`enabled` 和 `required`
- **AND** `description` MUST 描述适用场景和用途，供 Agent 判断何时读取该规则
- **AND** `description` MUST NOT 用来承载规则正文

#### Scenario: package baseline 排除未声明内置能力
- **WHEN** Buildr 打包或校验产品资产
- **THEN** builtin package 源目录下的文件 MUST 只有在 package manifest 声明或被 package include 边界覆盖时才能进入发布包

### Requirement: 场景化内置流程以 Skills 发布
Buildr package assets MUST 将由任务意图触发的场景化流程指引发布为内置 Skills，而不是 optional 内置 Rules。

#### Scenario: package 声明场景化流程指引
- **WHEN** Buildr package 包含需要按任务意图、工作流阶段、风险条件或命令流程判断是否适用的指引
- **THEN** `package/manifest.yml` MUST 将该指引声明为内置 Skill
- **AND** 对应默认 workspace baseline MUST 在 `skills/manifest.yml` 中登记该 Skill
- **AND** Buildr MUST NOT 将该指引发布为 optional 内置 Rule

#### Scenario: package 声明 invariant 指引
- **WHEN** Buildr package 包含定义 workspace 模型、源资产边界、必读入口或常驻 invariant 的指引
- **THEN** `package/manifest.yml` MAY 将该指引声明为内置 Rule
- **AND** required 内置 Rules MUST 只包含 Agent 无论任务意图如何都必须读取的指引

### Requirement: 默认 baseline 排除场景化 Rules
Buildr package baseline MUST 不在默认 `rules/buildr/` 资产中发布场景化内置流程指引。

#### Scenario: package check 校验 baseline Rules
- **WHEN** Agent 运行 `buildr package check`
- **THEN** 如果默认 package baseline 将任务分流、OpenSpec 工作流、worktree 工作流或 Git 操作流程发布为 optional 内置 Rules，Buildr MUST 校验失败
- **AND** 当 Buildr 仍随包提供这些流程指引时，Buildr MUST 校验等价指引可通过内置 Skills 获得

### Requirement: 产品验证覆盖递归 AGENTS runtime 投射
Buildr package check 和 product MVP verification MUST 覆盖 recursive `AGENTS.md` discovery、canonical scope resolution、adapter projection、safe reconciliation boundaries 及 user-visible task workflow status contracts。

#### Scenario: Root Project Service 深层规则链
- **WHEN** Buildr runs product verification in a temporary workspace
- **THEN** verification MUST create `AGENTS.md` at Root、Project、Service and a deeper Service module
- **AND** verification MUST confirm the discovery order is broader-to-more-specific
- **AND** verification MUST confirm a Service scope excludes sibling Service subtree rules

#### Scenario: Claude Code recursive bridges
- **WHEN** product verification renders Claude Code rules for Project、Service and root scopes
- **THEN** verification MUST confirm every discovered source has a same-directory managed `CLAUDE.md` bridge
- **AND** verification MUST confirm root sync reconciles all managed workspace rule sources

#### Scenario: Codex native recursive rules
- **WHEN** product verification renders or checks Codex for the same scopes
- **THEN** verification MUST confirm every discovered `AGENTS.md` is reported as native
- **AND** verification MUST confirm Rules projection writes no Codex bridge files

#### Scenario: Canonical and legacy scope behavior
- **WHEN** product verification exercises canonical and legacy Service scope inputs
- **THEN** verification MUST confirm canonical paths resolve to their literal workspace directories
- **AND** verification MUST confirm an unambiguous legacy Service shorthand resolves with a migration warning
- **AND** verification MUST confirm ambiguous or escaping scopes fail without runtime writes

#### Scenario: Recursive reconcile safety
- **WHEN** product verification encounters excluded directories、unregistered nested Git repos、directory symlinks、orphan managed bridges or non-Buildr-managed target conflicts
- **THEN** verification MUST confirm excluded and opaque boundaries are not traversed
- **AND** verification MUST confirm orphan managed bridges are removed
- **AND** verification MUST confirm a conflict prevents all planned Rules writes and preserves user content

#### Scenario: Task worktree container boundary
- **WHEN** Buildr initializes or validates a workspace package baseline
- **THEN** root `.gitignore` MUST ignore `/.worktrees/`
- **AND** recursive Rules discovery MUST treat `.worktrees/` as an excluded directory
- **AND** package verification MUST confirm `AGENTS.md` inside `.worktrees/` is not discovered or projected

#### Scenario: Task workflow Skill contract
- **WHEN** Buildr validates packaged task and OpenSpec Skills
- **THEN** task-worktree guidance MUST require `<workspace-root>/.worktrees/<task-id>` and pre-action path/branch disclosure
- **AND** OpenSpec workflow guidance MUST require pre-action change disclosure
- **AND** task-triage guidance MUST require the user-facing response to report current OpenSpec change status、progress and next action or blocking reason when OpenSpec is used

#### Scenario: Runtime capability metadata
- **WHEN** product verification runs `buildr runtime list --json`
- **THEN** verification MUST confirm each supported adapter reports canonical scope syntax、recursive Rules discovery、ancestor inclusion、projection mode and writes-files behavior
- **AND** rendered adapters MUST report their target pattern

### Requirement: Required Core 暴露 Rule 消费协议
Buildr package assets MUST 将 Rule manifest consumption protocol 保留在 required Buildr Core 中，同时将 task-triggered procedures 保留在 Skills 中。

#### Scenario: Package Core 声明 Rule 状态语义
- **WHEN** Buildr packages or validates `rules/buildr/core.md`
- **THEN** required Core MUST state that enabled、required and installed Rules are always read
- **AND** required Core MUST state that enabled optional installed Rules are selected semantically from description and task context
- **AND** required Core MUST state that disabled or uninstalled Rules do not participate in the task

#### Scenario: Package Core 不承载操作手册
- **WHEN** Buildr packages Rule consumption guidance
- **THEN** required Core MUST NOT copy task-specific Git、OpenSpec、worktree or other operational procedures
- **AND** reusable task procedures MUST remain available through the corresponding Skills

#### Scenario: Package Core 提供默认提交语言
- **WHEN** Buildr packages the default Git operations capability
- **THEN** Conventional Commits generation guidance MUST be provided by the Git operations Skill
- **AND** required Core MUST define Chinese as the default commit-message language when no more specific convention applies
- **AND** required Core MUST NOT contain Git commands、type selection or message generation procedures

### Requirement: Core 默认提交语言独立生效
Buildr package MUST 通过 required Core 提供独立于 Git Ops Skill 生命周期的默认提交语言。

#### Scenario: 初始化默认 workspace
- **WHEN** Buildr initializes a workspace from the default package
- **THEN** required Core MUST state that commit-message subject and body use Chinese when no more specific convention applies
- **AND** it MUST allow code identifiers、paths、scope and proper nouns to retain their original form

#### Scenario: 卸载 Git Ops Skill
- **WHEN** Git Ops Skill is uninstalled
- **THEN** the Core commit-language default MUST remain available to Agent rule consumption
- **AND** Buildr MUST NOT remove or alter Core as a side effect of the Skill lifecycle

#### Scenario: 更具体约定覆盖默认语言
- **WHEN** Project、Service or repository rules define a more specific commit language
- **THEN** Agent MUST use the more specific convention instead of the Core default

### Requirement: 产品验证覆盖提交信息资产边界
Buildr product verification MUST 防止提交格式与默认语言重新耦合到同一 Skill 生命周期。

#### Scenario: 校验 Git Ops 提交格式
- **WHEN** Buildr validates the packaged Git Ops Skill
- **THEN** verification MUST confirm the concise Conventional Commits format、supported types、optional scope and breaking-change guidance
- **AND** verification MUST confirm Git Ops follows Core and more specific conventions without copying the Chinese constraint

#### Scenario: 校验 Core 默认提交语言
- **WHEN** Buildr validates the default package and a temporary initialized workspace
- **THEN** verification MUST confirm required Core contains the concise Chinese default and allowed original-form exceptions
- **AND** verification MUST confirm the Core default remains present when Git Ops is absent

### Requirement: 产品验证覆盖 Git Ops 集成契约
Buildr product verification MUST 防止随包 Git Ops Skill 回退到未定义或默认 merge 的任务集成策略。

#### Scenario: 校验线性集成语义
- **WHEN** Buildr 验证随包 Git Ops Skill
- **THEN** 验证 MUST 确认 Skill 声明本地未推送任务分支默认 rebase
- **AND** 验证 MUST 确认目标分支默认 fast-forward-only 集成
- **AND** 验证 MUST 确认没有用户明确要求时不得创建 merge commit

#### Scenario: 校验共享分支保护
- **WHEN** Buildr 验证随包 Git Ops Skill
- **THEN** 验证 MUST 确认已推送或共享任务分支不得自动 rebase 或 force push
- **AND** 验证 MUST 确认需要语义决策的 rebase 冲突必须停止并等待用户确认

### Requirement: 产品验证覆盖 task worktree 隔离与证据复用
Buildr package verification MUST 防止 task-worktree guidance回退为change artifacts双写、合并前污染主自举workspace，或让Git/worktree providers重新拥有Candidate验证政策与evidence复用决策。

#### Scenario: 校验 change 创建时机
- **WHEN** Buildr验证随包task-worktree Skill
- **THEN** 验证 MUST确认实现型OpenSpec change在propose前创建或复用task worktree
- **AND** 验证 MUST确认采用worktree后artifacts、实现和候选验证只有一个写入位置

#### Scenario: 校验 provider 只交接候选事实
- **WHEN** Buildr验证Product Project开发规则、task-worktree Skill和git-ops Skill
- **THEN** 验证 MUST确认task-worktree只提供canonical checkout、clean/dirty状态和lifecycle transition evidence
- **AND** 验证 MUST确认git-ops只提供Git策略、refs影响、操作前后content identity和tree等价性信号
- **AND** 验证 MUST确认Candidate验证执行、evidence有效性、复用和重跑决策只由selected task-verification provider或其consumer负责

#### Scenario: 校验 Skill 文本没有重复职责
- **WHEN** Buildr执行package静态验证和任务能力专项测试
- **THEN** verifier MUST拒绝task-worktree中的重复自举sync/CLI入口段落
- **AND** verifier MUST拒绝git-ops或task-worktree重新声明Candidate验证命令、验证级别或最终evidence复用决策
- **AND** verifier MUST确认现有capability identity、version、provider和binding拓扑保持不变

#### Scenario: 候选验证保持主工作区干净
- **WHEN** 产品E2E从task worktree checkout验证未合并候选版本
- **THEN** 验证 MUST使用临时workspace或task worktree目标
- **AND** 验证前后的主开发工作区status MUST保持不变

#### Scenario: 不要求 post-merge 重复 E2E
- **WHEN** Buildr验证产品开发流程文本
- **THEN** 验证 MUST确认相同candidate identity集成后不要求在主开发分支重复产品E2E
- **AND** 验证 MUST区分实际workspace update/sync后的doctor与产品E2E

### Requirement: 产品验证覆盖 Task Finish 收尾契约
Buildr package verification MUST 确保 `task-finish` 作为 `buildr.task-finish/v1` 默认 provider 发布、按 capability 路由，并通过绑定的 worktree-lifecycle 与 Git task-integration providers 保留安全收尾契约。

#### Scenario: 校验 Task Finish 随包发布
- **WHEN** Buildr 执行 package check
- **THEN** workspace Skill manifests MUST 声明 enabled、installed 的 `task-finish` 及其 provides/requires
- **AND** 产品入口 Buildr Skill MUST 将完整任务收尾意图路由到 `buildr.task-finish/v1` selected provider
- **AND** Git Ops Skill description MUST NOT 继续声明完整“收尾”意图

#### Scenario: 校验收尾状态机
- **WHEN** Buildr 验证随包 `task-finish` Skill
- **THEN** 验证 MUST 覆盖前置检查、两个 required provider resolutions 与披露、OpenSpec 归档、EOF 空白行处理、验证证据复用、提交、provider integration、push、入口迁移和本地清理
- **AND** 验证 MUST 确认 tree 改变后重验、tree 相同时不重复 E2E
- **AND** verification MUST NOT require `task-finish` to duplicate the selected provider's rebase、fast-forward or merge policy
- **AND** verification MUST NOT require `task-finish` to duplicate worktree placement、retention or cleanup policy

#### Scenario: 校验收尾授权边界
- **WHEN** Buildr 验证随包 `task-finish` Skill
- **THEN** 验证 MUST 确认“收尾”不授权 force push、远端任务分支删除、丢弃改动、共享分支历史改写或语义冲突决策
- **AND** merge commit MUST follow the selected provider contract and execution disclosure rather than a global Task Finish prohibition
- **AND** 验证 MUST 确认任何失败会停止尚未执行的 integrate、push 或 cleanup

#### Scenario: Core 不复制收尾流程
- **WHEN** Buildr 验证 required Core、capability contracts 和 Task Finish provider
- **THEN** 完整 task closeout 操作手册 MUST 只存在于 Skills
- **AND** required Core MUST NOT 包含 OpenSpec archive EOF 修复或 Git 收尾步骤
- **AND** Core MAY contain only the provider-binding and workspace-transition invariants required regardless of optional Skill lifecycle

### Requirement: Package manifest 声明 workspace Components
Buildr package manifest MUST 显式声明随包 workspace Components，并将 Component 定义、外部 Skill resolved sources 和 Buildr-owned member sources 限制在可验证的发布边界内。

#### Scenario: 声明随包 Component
- **WHEN** Buildr 产品包提供 workspace Component
- **THEN** `package/manifest.yml` MUST 声明 Component id、定义源路径、默认启用状态和 required 状态
- **AND** Component 定义源 MUST 位于 `package/targets/workspace/components/<source>/<id>/component.yml`

#### Scenario: Component 定义引用不同来源成员
- **WHEN** 随包 Component 声明外部 Skills、Buildr-owned Rules/Skills、Command collections 或 Skill Contributions
- **THEN** 每个 Buildr-owned member 源和目标路径 MUST 位于允许的 workspace target 边界
- **AND** 每个外部 Skill MUST 声明可验证的 source、resolved source、version 和 integrity
- **AND** Component 定义 MUST 声明全部物化成员 integrity
- **AND** 同一个随包成员 MUST NOT 被多个 Component 声明生命周期所有权

#### Scenario: Package check 校验 Component
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Buildr MUST 校验 Component manifest schema、定义 schema、稳定 id、版本、来源、成员路径、成员存在性和 integrity
- **AND** Buildr MUST 校验外部 Skill 内容未包含 Buildr sidebar 修改
- **AND** Buildr MUST 校验 Component 与独立 Builtins、workspace baseline 和其他 Components 不存在 id、路径或 ownership 冲突

#### Scenario: OpenSpec Component 上游版本对齐
- **WHEN** package check 校验随包 OpenSpec Component
- **THEN** Buildr MUST 校验 OpenSpec Command collection 和全部声明的外部 workflow Skills 存在
- **AND** Buildr MUST 校验外部 Skills 的 `generatedBy`、resolved source 和 integrity 与 Component 声明的 OpenSpec 上游版本一致
- **AND** Buildr MUST 校验 sidebar 对该上游版本兼容

#### Scenario: Component 不重复进入 baseline 映射
- **WHEN** package manifest 已通过 Component 声明某个 Rule、Skill 或 Command collection
- **THEN** Buildr MUST NOT 再依赖重复的 workspace baseline 文件清单决定该成员的安装状态
- **AND** init/update MUST 通过 Component 生命周期物化该成员

### Requirement: 产品验证覆盖 Component 生命周期
Buildr package check 和产品端到端验证 MUST 覆盖 Component 及 Commands collections 的主要用户路径和安全边界。

#### Scenario: 临时 workspace Component 验证
- **WHEN** Agent 运行产品验证入口
- **THEN** 验证 MUST 覆盖默认 Component 初始化、list、check、install、uninstall、update 和 sync
- **AND** 验证 MUST 覆盖 Component 成员的 runtime 安装与清理

#### Scenario: Component 冲突与迁移验证
- **WHEN** Agent 运行产品验证入口
- **THEN** 验证 MUST 覆盖安全三方升级、用户修改阻塞、成员缺失、ownership conflict 和旧 OpenSpec Builtins 原位采用
- **AND** 验证 MUST 确认失败预检不会产生部分源资产写入

#### Scenario: Commands collections 验证
- **WHEN** Agent 运行产品验证入口
- **THEN** 验证 MUST 覆盖根 collection、嵌套 collection、相同声明合并、冲突声明报错和 Component-owned collection 保护

### Requirement: Package 发布 OpenSpec 契约门禁 sidebar
Buildr package MUST 发布 OpenSpec 契约门禁 Skill、Contribution fragments、CLI 契约和 Component metadata，并严格区分上游 workflow Skills 与 Buildr 自有 sidebar。

#### Scenario: Package manifest 声明门禁 Skill
- **WHEN** package check 校验 OpenSpec Component
- **THEN** package manifest MUST 将 `openspec-contract-guard` 声明为该 Component 的 Buildr-owned workspace Skill
- **AND** Component definition 和 integrity MUST 包含该 Skill 的完整源目录

#### Scenario: 校验不同来源的 Skills
- **WHEN** package check 遍历 OpenSpec Component Skill members
- **THEN** 外部 workflow Skills MUST 校验 `generatedBy`、resolved source 与 upstream version 一致
- **AND** 外部 workflow Skills MUST 位于外部来源命名空间且正文不含 Buildr sidebar 修改
- **AND** Buildr 契约门禁 Skill MUST 校验 Buildr 自有来源和支持的 upstream version
- **AND** package check MUST NOT 要求 Buildr sidebar 伪装为 OpenSpec 上游生成资产

#### Scenario: Runtime 组合 sidebar
- **WHEN** 临时 workspace 为支持的 Agent render OpenSpec Component
- **THEN** runtime workflow Skills MUST 由纯上游内容和 enabled sidebar contributions 确定性组合
- **AND** workspace 外部 Skill 源 MUST 与上游 package source 保持一致
- **AND** Component 卸载并 reconcile 后 runtime MUST 移除 sidebar 和 Component-owned workflow Skills，不得遗留 Buildr fork

### Requirement: 产品验证覆盖 OpenSpec 契约漂移门禁
Buildr 产品总验证 MUST 覆盖契约基线、同步前后检查、上游兼容性和候选 tree 的 canonical spec 变更审计。

#### Scenario: 门禁 fixture corpus
- **WHEN** 产品验证运行 OpenSpec contract fixtures
- **THEN** 验证 MUST 覆盖安全 ADDED、MODIFIED、REMOVED 和 RENAMED 同步
- **AND** 验证 MUST 覆盖 proposal/delta 不一致、active change 冲突、stale baseline、缺失基线、delta 后改动和未触达 Requirement 被破坏

#### Scenario: Product candidate 修改 canonical specs
- **WHEN** Product Project 的候选 Git tree 包含 canonical spec 变化
- **THEN** 产品验证 MUST 要求变化能够关联到通过 post-sync 的 active change 或本次归档 change receipt
- **AND** 只有 `openspec validate --all --strict` 通过 MUST NOT 被视为充分证据

#### Scenario: OpenSpec Component 上游升级
- **WHEN** package 中声明的 OpenSpec upstream version 变化
- **THEN** package check 和产品验证 MUST 对该版本运行 contract fixture corpus
- **AND** 未经支持或 fixture 失败 MUST 阻止 package verification 通过

#### Scenario: Runtime 投射门禁 Skill
- **WHEN** 临时 workspace 初始化、update 或 sync 支持的 Agent runtime
- **THEN** 产品 E2E MUST 验证 `openspec-contract-guard` 随 OpenSpec Component 物化并投射
- **AND** OpenSpec Component 被显式卸载时该 Skill MUST 随集合安全移除

#### Scenario: Runtime 组合和移除门禁 Contribution
- **WHEN** 临时 workspace 对支持的 Agent 安装或卸载 OpenSpec Component
- **THEN** 产品 E2E MUST 验证安装后的 `task-triage` 与 `task-finish` runtime 包含 Component-owned 门禁片段
- **AND** 产品 E2E MUST 验证卸载并 reconcile 后通用 runtime Skills 仍存在但门禁片段与命令完全消失
- **AND** workspace 中的通用 Skill 源 MUST NOT 因安装或卸载被注入门禁正文

### Requirement: Package output 只能安全接管和替换
Buildr MUST 将 package build 输出视为带版本化 receipt 和 integrity 的受管生成树，并在替换前验证目标 ownership。

#### Scenario: 新建或接管空输出目录
- **WHEN** `buildr package build --out <dir>` 的目标不存在或为空且不属于保护根
- **THEN** Buildr MUST 在同级 staging 完成构建后物化输出
- **AND** 输出 MUST 包含 `.buildr-package-output.json` receipt

#### Scenario: 安全替换既有输出
- **WHEN** 既有输出包含有效 receipt，且 live 文件集合与 integrity 匹配上次 receipt
- **THEN** Buildr MUST staged build 新输出并原子替换旧输出
- **AND** 失败时 MUST 恢复旧输出

#### Scenario: 拒绝未受管或已修改输出
- **WHEN** 输出目录非空但没有有效 receipt，或 live 内容已修改、缺失或包含未登记文件
- **THEN** Buildr MUST 在删除任何目标内容前拒绝构建
- **AND** Buildr MUST NOT 提供隐式 force 覆盖

#### Scenario: 拒绝危险输出路径
- **WHEN** `--out` 解析为 workspace 根、Product 根、当前目录、用户 home、文件系统根、资产集合根或这些保护根的祖先
- **THEN** Buildr MUST 拒绝构建且保持目标不变

### Requirement: 产品验证覆盖分层验证门禁契约
Buildr package verification MUST 防止随包任务 Skills 和 Product Project 开发契约回退为普通收尾固定完整 Candidate、重复启动运行中验证、重复执行被上层入口覆盖的检查或把 browser 作为独立顶层测试类型。

#### Scenario: 校验日常与完整候选边界
- **WHEN** Buildr 验证随包任务 Skills 和 Product Project 开发契约
- **THEN** 验证 MUST 确认实现循环可以运行 minimal 快速反馈、普通完成和普通收尾要求 affected、发布高风险或显式完整验证要求 candidate
- **AND** 验证 MUST 确认 Task Finish 不维护测试命令或路径风险名单

#### Scenario: 校验完整验证去重语义
- **WHEN** Buildr 验证实现阶段和收尾阶段的流程文本
- **THEN** 验证 MUST 确认上层入口已覆盖的底层检查在同一候选状态中不会被机械重复
- **AND** 验证 MUST 确认相同 identity 的后续 Git 动作复用已有满足 requiredAssurance 的 evidence

#### Scenario: 校验运行中验证进程复用
- **WHEN** Buildr 验证随包任务 Skills
- **THEN** 验证 MUST 确认 session、cell、process id 或仍在运行状态通过 wait、poll 或 resume 继续
- **AND** 暂时无输出 MUST NOT 触发相同命令的重复启动

#### Scenario: 校验失败后的重验范围
- **WHEN** Buildr 验证失败后的修复流程
- **THEN** 验证 MUST 确认修复期间优先重跑失败项和受影响专项检查
- **AND** 最终内容变化后 MUST 重跑同一 requiredAssurance，普通任务不得机械升级为 Candidate

#### Scenario: 校验 browser integration 路由
- **WHEN** Buildr 验证 Product changed planner
- **THEN** planner MUST 能独立选择 Project、Service、Change 与 Shell browser integration
- **AND** 局部 API 或单资源页面改动 MUST NOT 触发无关资源 browser 流程、CLI architecture 或 managed mutations

#### Scenario: 校验外部 OpenSpec Skill 所有权
- **WHEN** Buildr 验证门禁的交付来源
- **THEN** 门禁 MUST 由 Buildr-owned Skills 或 Product Project 开发契约提供
- **AND** Component 管理的外部 `openspec-apply-change` Skill MUST 保持上游所有权

### Requirement: 产品验证覆盖 Git 工作区转换后的环境检查契约
Buildr package verification MUST 防止随包 Git 和任务 Skills 丢失一般工作区转换后的 Buildr 环境诊断边界，并 MUST 通过可执行产品验证证明 canonical task worktree 创建后的 doctor 与安全自动 sync 确定性发生。

#### Scenario: 校验 Git Ops 触发与排除范围
- **WHEN** Buildr 验证随包 Git Ops Skill 和 manifest description
- **THEN** 验证 MUST 确认 Skill 能路由 `pull`、`checkout`、`switch`、`reset`、`cherry-pick`、`revert` 和 `stash` 等工作区转换意图
- **AND** 验证 MUST 确认成功的一般工作区转换会在已初始化 Buildr workspace 中运行当前 Agent doctor
- **AND** 验证 MUST 确认 `fetch`、`push`、普通 `commit` 和失败或冲突中的工作区转换不会触发该检查

#### Scenario: 校验一般 Agent-first 同步交互
- **WHEN** Buildr 验证 worktree create 之外的 Git 工作区转换处理文本
- **THEN** 验证 MUST 确认 doctor 无需处理时不提醒 `render` 或 `sync`
- **AND** 验证 MUST 确认 doctor 发现问题时按 Rules、Skills、Commands、Components、Contributions 和 runtime 分类说明
- **AND** 验证 MUST 确认可由 sync 修复时先询问用户、同时提供手动命令，并在用户确认后由 Agent 执行 sync 和最终 doctor
- **AND** 验证 MUST 确认没有用户确认时不会执行一般 workspace sync，且不会默认要求用户自行运行命令
- **AND** 验证 MUST 确认 Agent 无法执行或用户选择手动方式时才使用手动操作兜底

#### Scenario: 校验 task worktree 产品入口
- **WHEN** Buildr 验证 `worktree create` CLI、帮助、JSON schema、随包 `task-worktree` Skill 和 capability routing
- **THEN** 验证 MUST 确认 Agent 负责提供 task id、branch、start point、Agent 和 workspace root，Buildr 负责 canonical create/reuse 与环境 bootstrap
- **AND** 验证 MUST 确认 task-worktree Skill 要求通过该产品入口创建新 checkout，而不是自行执行 `git worktree add` 后依赖文本提醒
- **AND** 验证 MUST 确认该入口不接管任务理解、OpenSpec 选择、merge、rebase、push 或 cleanup policy

#### Scenario: 校验创建后 doctor 与安全自动 sync
- **WHEN** 产品 E2E 在临时已初始化 Git workspace 调用 `worktree create`
- **THEN** 验证 MUST 证明新 canonical checkout 一定执行当前 Agent doctor
- **AND** runtime healthy 时 MUST 跳过 sync
- **AND** 唯一 actionable finding 为当前 Agent runtime stale、checkout clean 且 identity 未变化时 MUST 自动 sync 并通过最终 doctor
- **AND** JSON MUST 返回 created/reused、treeChanged、doctor before/after、sync decision、blocked reason 和 nextActions

#### Scenario: 校验安全分类 fail closed
- **WHEN** 临时 workspace 分别构造 occupied path、branch 已被占用、dirty/identity 变化、mutation blocked、非 runtime actionable finding、sync preflight 决策或 sync 后 doctor 失败
- **THEN** 验证 MUST 确认产品不会执行不安全 sync、不会执行 doctor 输出中的任意命令、不会删除已创建 checkout或丢弃内容
- **AND** 创建前冲突 MUST 零写入，创建后 bootstrap 阻塞 MUST 保留现场并返回结构化 nextActions

#### Scenario: 校验幂等复用
- **WHEN** 同一 task id、repository 与 branch 再次调用 `worktree create`
- **THEN** 验证 MUST 返回 `reused`、`treeChanged: false`，且不重复 doctor 或 sync
- **AND** identity 不匹配 MUST fail closed

#### Scenario: 校验无需 Git hook
- **WHEN** Buildr 验证工作区转换后的环境检查实现
- **THEN** 验证 MUST 确认随包资产不要求安装或维护 Git hook、daemon、文件 watcher 或定时任务
- **AND** 验证 MUST 保留绕过 Buildr worktree create 的外部 Git 操作只能由后续 Buildr 基线 doctor 兜底的边界

### Requirement: 产品验证覆盖 Git-first workspace 更新编排
Buildr product verification MUST 防止产品入口 Buildr Skill 和随包引导退回到只执行本地 `buildr sync` 的 workspace 更新语义。

#### Scenario: 校验 Git 管理 workspace 的更新顺序
- **WHEN** Buildr 验证产品入口 Buildr Skill、bootstrap guide、CLI reference 和 runtime 提示
- **THEN** 验证 MUST 确认“更新 workspace”与“同步 workspace”会先复用 Git Ops 安全更新 Git 管理的 workspace checkout，再执行 `buildr sync <agent> --target <workspace-root>`
- **AND** 验证 MUST 确认该意图不会先运行 `buildr update`
- **AND** 验证 MUST 确认 Git 更新成功后无需再次询问 sync 授权

#### Scenario: 校验 Git 更新失败边界
- **WHEN** Buildr 验证 Git 管理 workspace 的更新决策点
- **THEN** 验证 MUST 确认本地改动、分叉、冲突、缺少 upstream 或其他 Git 决策点会阻止后续 sync
- **AND** 验证 MUST 确认 Agent 不会自动 stash、rebase 或覆盖用户内容

#### Scenario: 校验非 Git workspace 和 CLI 职责边界
- **WHEN** Buildr 验证非 Git workspace 或 `buildr sync` 命令说明
- **THEN** 验证 MUST 确认非 Git workspace 直接执行 sync
- **AND** 验证 MUST 确认 Git 更新属于 Agent 意图编排，而不是 `buildr sync` CLI 的隐式行为

### Requirement: 产品验证覆盖 capability provider replacement
Buildr product verification MUST 覆盖默认 provider、内部 provider 替换、provider 卸载、歧义、版本冲突和 optional degradation，并 MUST 验证所有 supported runtime adapters 获得一致 binding 语义。

#### Scenario: 默认 providers 完成现有工作流
- **WHEN** a temporary workspace uses package defaults
- **THEN** Git/task consumers MUST resolve to the declared builtin providers
- **AND** existing workspace update、worktree and finish behavior MUST remain available

#### Scenario: 内部 provider 替换 Git Ops
- **WHEN** a temporary workspace installs compatible internal Git providers、binds all required Git capabilities and uninstalls `git-ops`
- **THEN** product entry、`task-worktree` and `task-finish` MUST remain capability-ready
- **AND** render and doctor MUST identify the internal providers without restoring `git-ops`

#### Scenario: Required provider 缺失或有歧义
- **WHEN** a test removes the only compatible required provider or leaves multiple unbound providers in the nearest scope
- **THEN** doctor MUST report `blocked` with `missing_provider` or `ambiguous_provider` reason、affected consumers、candidates and nextActions
- **AND** runtime render MUST retain affected consumers with blocked safety guidance and retain unrelated Skills

#### Scenario: Optional provider 缺失
- **WHEN** `task-asset-review` is unavailable to `task-finish`
- **THEN** doctor MUST report non-blocking degradation
- **AND** rendered Task Finish binding evidence MUST declare the skipped optional stage

#### Scenario: Runtime adapters 接收相同解析结果
- **WHEN** Buildr renders the same scope for each supported Agent adapter
- **THEN** every adapter MUST project equivalent capability status、selected provider and provenance
- **AND** adapter-specific paths MUST NOT change provider resolution

#### Scenario: Transitive provider dependency 被阻断或成环
- **WHEN** selected provider 的 required dependency blocked，或 capability graph contains a required cycle
- **THEN** product verification MUST confirm blocked readiness propagates to every affected upstream consumer
- **AND** doctor MUST report `provider_not_ready` root cause chain or `dependency_cycle` path without hanging or selecting an arbitrary edge

### Requirement: package 验证必须按资产与行为边界拆分
Buildr MUST 将 package 静态内容校验、package workspace smoke 和领域 integration 实现为可独立执行的 verifier，并 MUST 让 `buildr package check` 聚合这些 verifier 的结果而不改变公开成功或失败语义。

#### Scenario: 维护者运行 package check
- **WHEN** 维护者运行 `buildr package check`
- **THEN** 命令 MUST 执行全部已登记 package verifier
- **AND** 任一 verifier 失败 MUST 使聚合命令返回非零状态并标识失败边界

#### Scenario: package 静态校验独立执行
- **WHEN** Candidate 或 affected 验证执行 package static verifier
- **THEN** verifier MUST 校验 manifest、inventory、随包 baseline、Skill/Rule/Component 内容契约和必要支持工具
- **AND** verifier MUST NOT 创建临时用户 workspace 或执行领域 CLI 生命周期

#### Scenario: package workspace smoke 独立执行
- **WHEN** Candidate 或维护者执行 package workspace smoke
- **THEN** verifier MUST 验证 init 生成的随包 baseline、现有 `AGENTS.md` 兼容和最终 doctor 收敛
- **AND** verifier MUST NOT 重复 Commands、Rules、Skills 或全部 runtime adapter 的细粒度 CRUD 与投射矩阵

#### Scenario: 领域 integration 独立执行
- **WHEN** package 验证需要覆盖 Commands、Rules、Skills 或 runtime 的行为契约
- **THEN** 对应断言 MUST 由稳定的 focused verifier identity 持有
- **AND** package check MAY 聚合该 verifier，但 package workspace smoke MUST NOT 复制其完整场景

### Requirement: Package baseline 只交付 workspace Skill authority
Buildr package MUST 只向 workspace baseline 交付受管 Skill manifest、contracts、sources 和 Components，并 MUST NOT 在默认 Project template 中交付 Skill source assets。

#### Scenario: 初始化 package workspace
- **WHEN** package manifest 将 Skill baseline 映射到新 workspace
- **THEN** 所有 workspace-managed Skill entries MUST 写入根 `skills/manifest.yml`
- **AND** Project template MUST NOT 包含 `skills/` 或 `skills/manifest.yml`

#### Scenario: Package Skill 声明 Project applicability
- **WHEN** 随包 Skill 只适用于特定 Project 类型或 capability context
- **THEN** package MUST 通过 Project capability/applicability declaration 引用 workspace Skill ID
- **AND** MUST NOT 复制 Skill source 到 Project template

### Requirement: Package verification 覆盖 destination 与冲突迁移
产品验证 MUST 覆盖 workspace-only source、user/workspace render destination、effective inventory conflict 和 legacy Project Skill migration。

#### Scenario: 临时 workspace Skill 生命周期
- **WHEN** package verification 创建临时 workspace 并维护 Skill
- **THEN** verification MUST 覆盖 workspace add/remove、workspace render、显式 user render 隔离和最终 doctor
- **AND** MUST 证明 init/sync 不写用户层

#### Scenario: Project Skill migration fixtures
- **WHEN** verification 检查 legacy workspace
- **THEN** MUST 覆盖 Project 独有 Skill、等价重复、同名不同内容、Project binding 和 migration rollback
- **AND** blocking conflict MUST 保持整次零写入

### Requirement: Package baseline 交付 Project Command requirements context
Buildr package MUST 为新 Project 交付空的 Command requirements baseline，并 MUST 保持 workspace catalog 与 Project references 分离。

#### Scenario: 初始化 Project template
- **WHEN** package Project template 被用于创建 Project
- **THEN** template MUST 创建 `commands.yml` with `buildr.project-commands/v1`
- **AND** requirements MUST 默认为空
- **AND** MUST NOT 复制 workspace Command definitions

#### Scenario: Package 验证 Commands 三层模型
- **WHEN** Agent 执行 package verification
- **THEN** verifier MUST 覆盖 catalog definition、Project requirement resolution 和 machine observation
- **AND** MUST 覆盖单 Project、跨 Project compatible、跨 Project conflict 和无 Project context
- **AND** MUST 证明 Buildr 不安装 binary 或保存凭证

#### Scenario: 旧 Project baseline 兼容
- **WHEN** package verifier 打开没有 `commands.yml` 的旧 Project fixture
- **THEN** Buildr MUST 将 requirements 解析为空集并给出可修复状态
- **AND** sync 或 migration MUST 能安全补齐空 baseline

### Requirement: 随包任务验证能力保持完整可组合
Buildr package MUST 原子交付 `buildr.task-verification/v2` contract、默认 `task-verification` provider、测试能力声明参考/模板、workspace binding、Task Finish consumer dependency 和全部 supported runtime 投射输入，并 MUST 通过产品验证防止验证职责重新耦合到 worktree lifecycle provider或具体团队测试分层。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation 读取随包能力声明
- **THEN** workspace Skills manifest MUST 声明 installed、enabled 的 `task-verification` provider及 `buildr.task-verification/v2` contract 和 binding
- **AND** `task-finish` MUST 以 required consumer dependency 引用 v2，而不是固定 provider id

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation 检查 `task-verification` 完整目录
- **THEN** provider MUST 包含可读取的 schema 参考和初始化模板
- **AND** 资料 MUST 使用通用能力集合、成熟度、阶段、环境、副作用和授权模型，不得包含具体团队固定分层

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时 workspace 为任一 supported runtime 完成 sync 或 render
- **THEN** runtime inventory MUST 包含可发现的 `task-verification` Skill
- **AND** description MUST 覆盖直接测试、实现完成节点、所需保证 evidence、初始化测试声明和测试能力演进意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr 运行随包任务 Skills 契约验证
- **THEN** verifier MUST 同时覆盖 affected、candidate、Task Finish consumer、零配置 legacy、augment 声明、authoritative Candidate 和增量演进路径
- **AND** verifier MUST 确认 provider 返回 `requiredAssurance`，且不依赖 Git worktree、Git provider identity、Buildr Product 专用验证命令或固定团队分层

#### Scenario: 替换默认验证 provider
- **WHEN** workspace 安装并绑定兼容的内部 `buildr.task-verification/v2` provider
- **THEN** Task Finish MUST 通过 binding 使用新 provider而不修改 consumer Skill
- **AND** 默认 provider 在不再被选中时 MUST 可安全卸载而不破坏 consumer

### Requirement: 产品验证覆盖 Candidate task metadata 分类
Buildr package verification MUST 覆盖 `verification-result-metadata-only` 的允许与拒绝路径，并 MUST 确认该优化保持 task-verification v2 provider identity、默认 binding、requiredAssurance 和原 evidence identity。

#### Scenario: 校验唯一 checkbox transition
- **WHEN** package contract tests 读取 Task Finish、Task Verification、OpenSpec apply sidebar 和 closeout fixtures
- **THEN** 验证 MUST 确认同一会话内唯一最终验证任务的精确 `[ ]` → `[x]` transition 复用原 evidence且 verification executor count 为 `0`
- **AND** 结果 MUST 保留 source implementation identity、requiredAssurance 与独立 target delivery identity

#### Scenario: 校验 fail-closed 分支
- **WHEN** fixture 表示额外内容变化、任务歧义或跨会话缺少 transition evidence
- **THEN** 验证 MUST 确认 transition 为 `implementation-changed` 并要求重新执行同一 requiredAssurance
- **AND** verifier MUST 拒绝仅按 `tasks.md` 路径、Markdown 类型或最终 checkbox 状态放行

#### Scenario: 校验能力拓扑迁移
- **WHEN** Buildr package verification 检查 contract、provider、consumer 和 binding
- **THEN** 验证 MUST 确认默认拓扑完整迁移到 `buildr.task-verification/v2` 且不存在仍被默认流程引用的 v1
- **AND** 验证 MUST 确认外部 `openspec-*` Skill 源未被修改

### Requirement: Package 原子交付任务资产观察 v2
Buildr package MUST 原子交付 `buildr.task-asset-review/v2` contract、默认 provider、内部 helper 与模板、workspace binding、产品入口路由和 Task Finish optional dependency。

#### Scenario: Package 安装 v2
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v2 contract 和完整 task-asset-review Skill 目录
- **AND** default binding 与 Task Finish requirement MUST 引用 v2

#### Scenario: Package 校验内部资源
- **WHEN** Agent 运行 package check 或产品 affected verification
- **THEN** verifier MUST 检查 helper、模板、manifest contract identity 和 provider/consumer version 一致性
- **AND** verifier MUST 覆盖共享路径、owner mismatch、原子写入、accept、reject 和 handoff 行为

#### Scenario: Optional provider 缺失
- **WHEN** `buildr.task-asset-review/v2` 对 Task Finish 不可用
- **THEN** doctor MUST 报告 non-blocking degradation
- **AND** runtime binding evidence MUST 声明 finalize stage skipped
### Requirement: 随包 task-worktree guidance 必须简洁且结构化
Buildr package MUST 以单一 routing description 和结构化正文交付 `task-worktree` guidance；description MUST 只表达触发意图与职责边界，正文 MUST 按决策、生命周期、协作交接、授权与停止条件组织，且 MUST NOT 重复 capability contract 的完整字段或在 Guardrails 中再次复述前文规则。

#### Scenario: 静态验证简洁结构
- **WHEN** Buildr 验证随包 `task-worktree` Skill
- **THEN** verifier MUST 确认 description 为单句 routing index
- **AND** verifier MUST 确认正文明确区分 create、reuse、none 与 blocked
- **AND** verifier MUST 拒绝重复的 contract evidence 清单、doctor/sync 入口段落和独立重复 Guardrails

#### Scenario: 复用仍执行当前状态门禁
- **WHEN** provider 复用 plan 完全一致且没有 tree transition 的既有 task environment
- **THEN** guidance MUST 只跳过 create-time doctor 与自动 sync
- **AND** guidance MUST 仍要求核对当前 context、membership、repository identities、CLI source 和本次动作需要的 clean/integration 状态

#### Scenario: 元内容升级为实现任务
- **WHEN** 未使用 task environment 的元内容任务后来进入代码修改、构建或测试
- **THEN** guidance MUST 要求先创建或复用 canonical task environment
- **AND** guidance MUST 只在证明 artifacts ownership、内容和唯一目标后收敛副本
- **AND** 无法证明为任务自有重复副本时 MUST 停止删除或覆盖

#### Scenario: capability 拓扑保持兼容
- **WHEN** Buildr 交付优化后的 `task-worktree` Skill
- **THEN** `buildr.task-worktree-lifecycle/v2` identity、provider、bindings、consumer readiness 和 CLI 行为 MUST 保持不变

### Requirement: 内置 Skill routing description 必须保持单一事实
Buildr MUST 让内置 Skill 的 package manifest description、workspace baseline manifest description 与 Skill frontmatter description 完全一致，并 MUST 在 package check 中阻止 drift。

#### Scenario: package 与 workspace description 不一致
- **WHEN** package check 发现同一 builtin Skill 的任一 manifest description 与源 `SKILL.md` frontmatter 不一致
- **THEN** verification MUST 失败并报告 Skill id 与不一致来源
- **AND** Buildr MUST NOT 把 capability binding ready 表述为 routing description 已对齐

#### Scenario: workspace sync 更新 routing description
- **WHEN** 新 package 修改 builtin Skill frontmatter description
- **THEN** sync MUST 将相同 description 写入 workspace `skills/manifest.yml`
- **AND** runtime projection MUST 使用该源 Skill 的一致 description
