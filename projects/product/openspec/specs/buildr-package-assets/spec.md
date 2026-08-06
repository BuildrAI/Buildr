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
- **WHEN** Buildr validates the packaged Git Operations Skill
- **THEN** verification MUST confirm the concise Conventional Commits format、supported types、optional scope and breaking-change guidance
- **AND** verification MUST confirm Git Operations follows Core and more specific conventions without copying the Chinese constraint

#### Scenario: 校验 Core 默认提交语言
- **WHEN** Buildr validates the default package and a temporary initialized workspace
- **THEN** verification MUST confirm required Core contains the concise Chinese default and allowed original-form exceptions
- **AND** verification MUST confirm the Core default remains present when Git Operations is absent

### Requirement: 产品验证覆盖 task worktree 隔离与证据复用
Buildr package verification MUST 防止正式 workflow 绕过 Task Environment 直接把 task-worktree 当作环境 authority，也 MUST 防止 change artifacts 双写、合并前污染 retained self-bootstrap Workspace，或让 Git/worktree providers重新拥有 Runtime/依赖、Candidate verification 或 evidence 复用决策。

#### Scenario: 校验 Change 创建时机
- **WHEN** Buildr 验证 task-triage、OpenSpec contribution 与随包 Task Environment Skill
- **THEN** 验证 MUST 确认实现型 OpenSpec Change 在 propose 前取得 matching `ready` Environment Receipt
- **AND** 采用 Environment 后 artifacts、实现和候选验证 MUST 只有 receipt 允许的写入位置

#### Scenario: 校验 Git provider 只交接 Git 事实
- **WHEN** Buildr 验证 Product Project 开发规则、task-environment、task-worktree 和 git-operations
- **THEN** 验证 MUST 确认 task-worktree 只提供 repository/checkout/branch/HEAD/clean 与 Git transition evidence
- **AND** task-environment MUST 独占 Runtime/CLI/依赖、projection、资源、restore 与总 cleanup，Task Verification MUST 独占 Candidate/evidence

#### Scenario: 校验 Skill 文本没有重复职责
- **WHEN** Buildr 执行 package 静态验证和任务能力专项测试
- **THEN** verifier MUST 拒绝 task-worktree 中的 Environment ready、runtime preparation、session adoption 或总 cleanup 说明
- **AND** verifier MUST 拒绝 git-operations/task-worktree 重新声明 Candidate 验证命令、保证级别或 evidence 复用决策

#### Scenario: 候选验证保持 retained Workspace 干净
- **WHEN** 产品 E2E 从 Task Validation Workspace 验证未合并候选版本
- **THEN** 验证 MUST 使用 receipt 绑定的验证根或无关临时 Workspace
- **AND** 验证前后的 retained Workspace 与 peer task worktree status/runtime MUST 保持不变

#### Scenario: 不要求 post-merge 重复 E2E
- **WHEN** Buildr 验证产品开发流程文本
- **THEN** 验证 MUST 确认相同 Candidate identity 集成后不要求在 retained 开发分支重复产品 E2E
- **AND** MUST 区分 Candidate E2E 与集成后 retained sync/render/doctor 的正式激活检查

### Requirement: 产品验证覆盖 Task Finish 收尾契约
Buildr package verification MUST确保`task-finish`作为`buildr.task-finish/v1`唯一默认provider发布，required消费`buildr.task-development@1`与`buildr.task-environment/v1`，只在retained metadata-only handoff optional消费`buildr.git-operations/v1`，并通过source/package/runtime parity保护current五阶段adapter。验证 MUST覆盖current Development Handoff、Task Contribution/Delivery Baseline、run-owned Delivery Carrier、deterministic reuse、Agent-reviewed Delivery Adaptation、target-race exact resume、真实remote readback、适用retained activation、Environment cleanup handoff与`formalVerificationExecutions: 0`。验证 MUST拒绝旧Task Finish writer、旧Verification/Change/Candidate authority输入、旧action/executor/router/schema/binding和与current v2重复的recovery path。

#### Scenario: 校验 Task Finish 随包发布
- **WHEN** Buildr执行package check或runtime parity verification
- **THEN** workspace/package manifests MUST声明enabled、installed的`task-finish`及其current provides/requires，所有runtime MUST投射相同Skill/contract identity
- **AND** 产品入口Buildr Skill MUST将完整任务收尾意图路由到`buildr.task-finish/v1`selected provider，Git Operations description MUST NOT声明完整“收尾”意图

#### Scenario: 校验收尾状态机
- **WHEN** verifier使用真实Task Environment、current Development Handoff与Git remote执行无冲突direct-to-target收尾
- **THEN** 一次canonical CLI invocation MUST连续完成`preflight → prepare → verify → deliver → cleanup`、普通push、远端ref回读与适用retained activation
- **AND** MUST断言`agentProviderCompletions: 0`、`manualRecoveryManifests: 0`、`formalVerificationExecutions: 0`且Candidate/generation/Review/Verification/decision未被Finish修改

#### Scenario: 校验收尾授权边界
- **WHEN** fixtures分别让Delivery Baseline无冲突前进、deliver发生target-race和同路径变化产生Git conflict
- **THEN** verifier MUST证明deterministic reuse、exact-token carrier rebuild与Agent-reviewed Delivery Adaptation都复用current Candidate/handoff且只在run-owned carrier发生
- **AND** MUST NOT把这些路径路由为Development rebuild、自动冲突解决或Formal Verification

#### Scenario: 校验旧authority残留
- **WHEN** package/static/runtime verification扫描current manifests、Skill/contract、CLI help/registry、Application registration、JSON schemas、managed mutations与executable tests
- **THEN** 旧Finish action/writer、`--project|--change`/Verification summary/caller Candidate输入、旧Git capability ids、旧Change convergence routing和并行run/receipt schema residual MUST为零
- **AND** archived Change与明确历史fixture MAY保留旧事实，但 MUST NOT被current runtime、help或默认tests解析为可用入口

#### Scenario: Core 不复制收尾流程
- **WHEN** verifier检查required Core、Task Development、Task Environment、Git Operations与Task Finish
- **THEN** Candidate/generation/decision MUST只由Development写入，资源/provider cleanup MUST只由Environment写入，单次Git Operation MUST不选择Finish流程，Task current records MUST只由各自Application写入Workspace SQLite
- **AND** Task Finish MUST只持有carrier/equivalence/delivery/retained activation/cleanup handoff/run恢复事实，不得创建第二份专业Result或顶层Task终态

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

### Requirement: 产品验证覆盖 Git 工作区转换后的环境检查契约
Buildr package verification MUST 防止 selected Git Operation 或任务 Skill 丢失一般工作区转换后的 Buildr 环境诊断边界，并 MUST 通过可执行产品验证证明 canonical task worktree 创建后的 doctor 与安全自动 sync 确定性发生；该验证 MUST NOT 把 `git-operations` 扩展成完整命令 router。

#### Scenario: 校验 Git Ops 触发与排除范围
- **WHEN** Buildr 验证随包 Git Operations Skill 和 manifest description
- **THEN** 验证 MUST 确认入口只在直接用户或 consumer 已选定 Git Operation 时加载，并覆盖明确的 commit、push 与组合语义
- **AND** 验证 MUST 确认 description 不预扩 checkout、reset、cherry-pick、stash、branch deletion 等完整命令集
- **AND** provider 对实际改变 checkout 的已选 operation MUST 返回 `treeChanged: true`，普通 commit/push MUST 返回 `false`

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
Buildr product verification MUST 防止产品入口 Buildr Skill 和随包引导退回到只执行本地 `buildr sync` 的 workspace 更新语义，同时 MUST 保证更新 operation 由产品入口选择而不是 Git Operations 自行推断。

#### Scenario: 校验 Git 管理 workspace 的更新顺序
- **WHEN** Buildr 验证产品入口 Buildr Skill、bootstrap guide、CLI reference 和 runtime 提示
- **THEN** 验证 MUST 确认“更新 workspace”与“同步 workspace”由 Buildr Skill 先向 selected `buildr.git-operations/v1` provider 提供 workspace、upstream 和明确 update operation，再执行 `buildr sync <agent> --target <workspace-root>`
- **AND** 验证 MUST 确认该意图不会先运行 `buildr update`
- **AND** 验证 MUST 确认 Git 更新成功后无需再次询问 sync 授权

#### Scenario: 校验 Git 更新失败边界
- **WHEN** Buildr 验证 Git 管理 workspace 的更新决策点
- **THEN** 验证 MUST 确认本地改动、分叉、冲突、缺少 upstream 或其他 Git 决策点会阻止后续 sync
- **AND** 验证 MUST 确认 Agent 不会自动 stash、reset、rebase、merge 或覆盖用户内容

#### Scenario: 校验非 Git workspace 和 CLI 职责边界
- **WHEN** Buildr 验证非 Git workspace 或 `buildr sync` 命令说明
- **THEN** 验证 MUST 确认非 Git workspace 直接执行 sync
- **AND** 验证 MUST 确认 Git 更新属于 Buildr Skill 的 consumer 编排，而不是 `buildr sync` CLI 或 Git Operations provider 的隐式行为

### Requirement: 产品验证覆盖 capability provider replacement
Buildr product verification MUST 覆盖默认 provider、内部 provider 替换、provider 卸载、歧义、版本冲突和 required dependency failure，并 MUST 验证所有 supported runtime adapters 获得一致 binding 语义。

#### Scenario: 默认 providers 完成现有工作流
- **WHEN** a temporary workspace uses package defaults
- **THEN** Git Operations、worktree、task consumers与Task Retrospective MUST resolve to the declared builtin providers
- **AND** existing workspace update、worktree and retained metadata-only finish behavior MUST remain available

#### Scenario: 内部 provider 替换 Git Ops
- **WHEN** a temporary workspace installs one compatible internal `buildr.git-operations@1` provider、binds it and uninstalls `git-operations`
- **THEN** product entry and `task-finish` MUST resolve the internal provider，且 `task-worktree` MUST 继续解析自己的独立 provider
- **AND** render and doctor MUST identify the internal provider without restoring `git-operations` or any removed legacy capability

#### Scenario: Required provider 缺失或有歧义
- **WHEN** a test removes the only compatible required provider or leaves multiple unbound providers in the nearest scope
- **THEN** doctor MUST report `blocked` with `missing_provider` or `ambiguous_provider` reason、affected consumers、candidates and nextActions
- **AND** runtime render MUST retain affected consumers with blocked safety guidance and retain unrelated Skills

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
产品验证 MUST 覆盖 workspace-only source、user/workspace render destination、effective inventory conflict，以及 legacy Project Skill source 被拒绝且不存在自动迁移路径。

#### Scenario: 临时 workspace Skill 生命周期
- **WHEN** package verification 创建临时 workspace 并维护 Skill
- **THEN** verification MUST 覆盖 workspace add/remove、workspace render、显式 user render 隔离和最终 doctor
- **AND** MUST 证明 init/sync 不写用户层

#### Scenario: Project Skill migration fixtures
- **WHEN** verification 检查包含 legacy Project Skill manifest 或 source 的 workspace
- **THEN** MUST 验证 Doctor 与 Skills CLI fail closed 且不返回可执行 migration command
- **AND** MUST 证明当前产品不会复制、合并、删除或改写 legacy Project Skill bytes

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
Buildr package MUST 原子交付 `buildr.task-verification/v3` contract、默认 `task-verification` provider、Project `buildr.project-verification/v2` reference/template、Workspace binding、CLI/Application runtime 与全部 supported runtime 投射输入。Package MUST 不再包含 v2 contract、v1 declaration reference、成熟度/三级 assurance/Candidate reuse guidance 或 Task Finish 的独立 verification summary authority。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation 读取随包能力声明
- **THEN** Workspace Skills manifest MUST 声明 installed、enabled 的 `task-verification` provider、`buildr.task-verification/v3` contract 与 binding
- **AND** package include mapping MUST 只投射 v3 contract 和 Project v2 reference/template

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation 检查 `task-verification` 完整目录
- **THEN** provider MUST 包含 v2 schema reference 和最小初始化模板
- **AND** 资料 MUST 只描述 capability identity、Project/Service scope、invocation、applicability、proves、requiredForDelivery 与按需边界

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时 Workspace 为任一 supported runtime 完成 sync 或 render
- **THEN** runtime inventory MUST 包含可发现的 v3 `task-verification` Skill
- **AND** description MUST 覆盖直接测试、正式 Task current Result、能力声明、实现完成验证与 coverage gap 意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr 运行随包任务 Skills 契约验证
- **THEN** verifier MUST 覆盖 Result closed schema、atomic replacement、current/stale/unknown、transient execution separation、coverage gap、Local App read-only 和 Finish shared consumer
- **AND** verifier MUST 确认 provider 不依赖固定 Git/Environment provider id，不拥有 Candidate、proceed/blocked 或 Task status

#### Scenario: 替换默认验证 provider
- **WHEN** Workspace 安装并绑定兼容的内部 `buildr.task-verification/v3` provider
- **THEN** consumers MUST 通过 binding 发现 provider 而不修改 consumer Skill
- **AND** 默认 provider 在不再被选中时 MUST 可安全卸载

### Requirement: 随包 task-worktree guidance 必须简洁且结构化
Buildr package MUST 以单一 routing description 和结构化正文交付窄 `task-worktree` guidance；description MUST 只匹配明确 Git worktree/本地任务分支意图或 selected Environment provider handoff。正文 MUST 只覆盖 Git plan、创建/复用/检查/保留/清理、evidence、授权与停止条件，并 MUST NOT 声明 Environment 生命周期、Runtime/依赖、session adoption、验证政策或总 cleanup。

#### Scenario: 静态验证简洁结构
- **WHEN** Buildr 验证随包 `task-worktree` Skill
- **THEN** verifier MUST 确认 description 为单句 routing index，且 package/workspace/frontmatter 完全一致
- **AND** verifier MUST 确认正文只消费/提供 `buildr.git-worktree-provider/v1` 的 Git 事实

#### Scenario: Environment 调用 Git provider
- **WHEN** selected Task Environment plan 需要创建或复用 worktree
- **THEN** guidance MUST 要求 provider 返回 repository plan 与真实 Git evidence
- **AND** MUST 将 Environment `ready`、依赖、runtime projection、动态资源和总 cleanup 留给上游 `task-environment`

#### Scenario: 用户只要求 Git worktree 操作
- **WHEN** 用户明确要求定位、创建、复用、保留或清理特定 task worktree/本地任务分支
- **THEN** `task-worktree` MUST 披露精确 repository、branch、path、Git effects 与未授权破坏性动作
- **AND** MUST NOT 自动创建 Task Record、Environment Receipt 或把 provider result 报告为正式执行 ready

#### Scenario: capability 拓扑完成破坏性切换
- **WHEN** Buildr 交付 P0.2 package
- **THEN** `task-worktree` MUST 提供 `buildr.git-worktree-provider/v1`，旧 `buildr.task-worktree-lifecycle@2` provider/binding MUST 不再存在
- **AND** runtime/doctor MUST 不得保留能够让正式 consumer 选择旧 contract 的兼容拓扑

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

### Requirement: Package 必须原子交付 Task Manager 能力
Buildr package MUST 原子交付 Task Record Domain/Application/repository、`buildr.task-record/v1` capability contract、默认 `task-manager` provider、workspace binding、Skill source、CLI/help/runtime 接线、Local App Task routes/API/Web assets 和公开 JSON identity；任一 identity、path、version、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 将包含 Task Manager 的 package 初始化或同步到 Workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-record@1` contract、`task-manager` Skill 与 default binding
- **AND** `task-manager` MUST 是 enabled、installed、optional builtin，并通过 `provides` 声明 `buildr.task-record@1`

#### Scenario: capability contract identity 不一致
- **WHEN** package manifest、workspace baseline manifest、contract frontmatter、provider `provides` 或 binding 对 capability id/version 的声明不一致
- **THEN** package check 和 doctor MUST 报告 identity integrity error
- **AND** runtime projection MUST NOT 猜测其中一份 identity 继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace 从已集成的产品 source 对支持的 Agent runtime 执行 sync/render
- **THEN** runtime MUST 收到完整 `task-manager` Skill、更新后的 `task-triage` 与受管 source/binding evidence
- **AND** doctor MUST 只在 contract、provider、consumer binding 和 runtime source 都可解析时报告 structurally ready

#### Scenario: bundled Local App 加载 Task 页面
- **WHEN** checkout、npm tarball 或平台 bundle 启动 Local App 并打开已登记 Workspace
- **THEN** server MUST 交付 Task route shell、Task Web feature 与对应 Workspace-scoped API
- **AND** Local App 与 CLI MUST 绑定同一 Task Record Application，不得各自携带独立 validator 或 filesystem writer

### Requirement: task-manager routing 与职责边界必须由 package verification 保护
Buildr package MUST 让 `task-manager` frontmatter、package manifest 与 workspace baseline manifest 使用完全一致的单句 description，并 MUST 通过静态与行为 fixture 防止它退化为全局 dispatcher、Task Core 或专业阶段执行器。

#### Scenario: routing description 正向覆盖
- **WHEN** fixture 表达创建、查看、更新、结束正式 Task Record 或按 Task ID 恢复顶层事实
- **THEN** `task-manager` description MUST 覆盖该意图
- **AND** Skill 正文 MUST 要求使用 selected `buildr.task-record/v1` provider 和实际 result evidence

#### Scenario: routing description 负向覆盖
- **WHEN** fixture 只表达普通修复/实现意图、纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** package verification MUST 确认 `task-manager` 不自动创建正式 Task
- **AND** `task-triage` 或其他适用入口 MUST 不因新 Skill id 被遮蔽

#### Scenario: 专业职责渗入
- **WHEN** `task-manager` Skill 或 contract 包含 Environment 创建/记录、研发计划/实现、Review 判断、Verification 执行、Git policy、Finish 编排、Board 状态或 Retrospective 逻辑
- **THEN** package verification MUST 失败并报告越界内容
- **AND** provider MUST 只拥有 Task Record 五个 action 与结果证据

#### Scenario: Local App 前端复制产品逻辑
- **WHEN** Task Web feature 自行解析/render `task.yml`、实现状态迁移、解析 Project/Service/Change identity 或直接接受 filesystem path
- **THEN** package/static verification MUST 失败并报告重复 authority
- **AND** Web feature MUST 只调用登记的 Workspace Task API 并展示 Application result

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 `task-triage` 提供 optional `buildr.task-record@1` consumer edge，并 MUST 让 Skill source 在 formal execution 分支首次持久写入前调用 selected provider；该依赖 MUST NOT 阻塞纯讨论、只读或 Task 外操作。

#### Scenario: 检查 capability graph
- **WHEN** package verification 检查当前 capability graph
- **THEN** graph MUST 包含 `buildr.task-record@1`、default `task-manager` provider/binding 和 `task-triage` optional consumer edge
- **AND** MUST NOT 给 task-worktree、task-verification、task-finish、task-asset-review 或 git-operations 增加 Task Record consumer edge

#### Scenario: 正式分支 provider 不 ready
- **WHEN** task-triage 已确认即将进入正式持久交付但 Task Record provider 不 ready
- **THEN** execution/write 分支 MUST fail closed 并报告 readiness 与 next action
- **AND** semantic triage result MUST 保持可见

#### Scenario: 旧专业模块继续运行
- **WHEN** 正式 Task 调用当前 worktree、Verification、Task Finish、Asset Review 或 Git 路径
- **THEN** 它们 MUST 继续只维护自己的专业 receipt/result/store
- **AND** MUST NOT 自动回填专业字段到 Task Record

### Requirement: 候选 package 变更不得提前激活 retained runtime
task worktree/branch 内的 Task Manager、task-triage、contract、manifest 和 generated package 变更 MUST 视为候选 self-bootstrap 内容；候选 source MAY 更新同一 task worktree 所承载的任务验证 Workspace runtime，也 MAY 在任务验证 Workspace 或无关临时 Workspace 内向隔离的模拟用户目录投射以验证 user destination，但 MUST NOT 更新共享同一 Git common-dir 的 retained checkout、另一个 task worktree 或验证 Workspace 之外的用户级共享 runtime。隔离模拟投射 MUST NOT 被报告为 retained runtime 或真实用户 runtime 已生效。只有实现完成并集成到 retained checkout 后，从 retained product source 执行的 sync/render 才能更新 retained Agent runtime。

#### Scenario: 开发阶段验证候选资产
- **WHEN** Agent 在 task worktree 中实现或测试 Task Manager
- **THEN** verifier MAY 使用无关临时 Workspace，或把 receipt-bound candidate CLI 投射到同一 task worktree 的任务验证 Workspace root
- **AND** 产品 MUST 在写入前阻止候选 source 以 retained checkout 或 peer task worktree 为 runtime target，且 verifier MUST NOT 把任务级候选 runtime 报告为 retained runtime 已生效
- **AND** user destination 只有在实际 runtime target 位于验证 Workspace 根内时 MAY 作为隔离模拟投射执行；验证 Workspace 外的共享用户 runtime MUST 在写入前被阻止

#### Scenario: retained source 准备任务验证 Workspace
- **WHEN** retained Product source 为一个 task worktree 准备 workspace-scoped runtime
- **THEN** sync/render MAY 以该 task worktree 为 target
- **AND** 该动作 MUST NOT 把 task worktree 升格为 canonical Task Record authority 或正式 retained runtime

#### Scenario: 集成后激活
- **WHEN** 最终候选已验证并进入 retained checkout
- **THEN** Agent MUST 从 retained `projects/product/buildr` 执行适用 sync/render/doctor
- **AND** activation evidence MUST 匹配 retained source identity、受管 runtime source 与 Task Manager/task-triage 专项验收

### Requirement: 产品验证必须覆盖 Task Manager package、CLI 与 Local App parity
Buildr package verification MUST 在 checkout、初始化 Workspace、同步 Workspace、隔离 runtime、Local App browser 与 npm tarball 场景覆盖 contract/Skill 投射、task-triage consumer、CLI registry/help、Local App route/API/assets、public JSON、filesystem effect 和失败分支，并 MUST 在任一入口行为漂移时失败。

#### Scenario: checkout 与 tarball 成功路径
- **WHEN** verifier 分别使用 checkout CLI 与 npm tarball CLI 对等执行 create、inspect、update、complete 和 abandon
- **THEN** 两者 MUST 使用相同 command help、record schema、result schema、canonical YAML 与状态语义
- **AND** 输出 MUST 只允许 machine-specific canonical path 和时间不同

#### Scenario: checkout 与 tarball 失败路径
- **WHEN** verifier 分别触发重复 Task ID、终态改写、无效引用、Task 路径占用和损坏 record
- **THEN** 两者 MUST 返回等价的 stable code、blocked status、effects 与 nextActions
- **AND** 原 record 与同目录其他 owner 的 bytes MUST 保持不变；原子替换失败的精确文件保证由 shared repository integration fixture 验证，不伪造 CLI fault injection

#### Scenario: package source 与 runtime drift
- **WHEN** Skill source、contract、manifest description、consumer/binding evidence、CLI schema registry 或 runtime 投射中的任一项缺失或过期
- **THEN** affected/package verification MUST 报告精确资产和 identity drift
- **AND** Buildr MUST NOT 把结构 ready 冒充为 Task Record 行为或 retained runtime 已验证

#### Scenario: CLI 与 Local App 行为漂移
- **WHEN** CLI 与 Local App 对相同 create/update/complete/abandon input 产生不同 canonical record、validation code 或 state transition
- **THEN** affected/browser/package verification MUST 失败并指出发生漂移的 Application client
- **AND** 两个入口同时写出相同错误结果 MUST NOT 掩盖 canonical Task Record contract 失败

### Requirement: Package 必须原子交付 Task Environment authority
Buildr package MUST 原子交付 `buildr.task-environment/v1` contract、Task Environment Application、`task-environment` Skill、公共 CLI/JSON、Environment Receipt writer、Task-scoped Change Reference Resolver、Local App Environment reader/API、`buildr.git-worktree-provider/v1` contract、更新后的 `task-worktree` provider、default bindings、consumer edges、runtime source mappings 与迁移验证。任一 identity、version、provider、binding、CLI/schema 或 source mapping 不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 初始化或同步包含 P0.2 的 Workspace
- **THEN** workspace Skills manifest MUST 登记两个新 contracts、enabled/installed 的 `task-environment` 与收窄后的 `task-worktree`
- **AND** default bindings MUST 分别选择 `task-environment` 和 `task-worktree`，不得保留 `buildr.task-worktree-lifecycle@2`

#### Scenario: capability graph 解析
- **WHEN** doctor 解析 task-triage、task-environment、task-worktree 与 task-finish
- **THEN** graph MUST 显示正式 workflow 消费 `buildr.task-environment/v1`，Environment 按需消费 `buildr.git-worktree-provider/v1`
- **AND** 旧 capability、缺失 provider、歧义或版本冲突 MUST 产生精确 blocked/degraded 诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** package verification 检查 root help、topic help、CLI registry 与 public JSON schema registry
- **THEN** `buildr task environment prepare|inspect|cleanup` MUST 全部出现并使用 `buildr.task-environment-result/v1`，内部 `resource register/release` MUST NOT 出现
- **AND** `worktree create|inspect|cleanup` MUST 只使用 `buildr.git-worktree-result/v1` 描述 Git provider evidence，`worktree context|adopt` 与 Environment ready/restore/runtime/cleanup authority MUST 不再存在

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** task worktree 中的候选新增 Task Environment Skill、contracts、Application/CLI 或 runtime assets
- **THEN** candidate CLI MAY 只向同一 receipt 绑定的任务验证工作区或其内隔离 user destination 投射
- **AND** MUST 在写入前阻止 retained Workspace、peer task worktree 和验证根外共享 user runtime target

#### Scenario: 集成后激活
- **WHEN** P0.2 候选已进入 retained checkout
- **THEN** Agent MUST 从 retained Product source 执行适用 sync/render/doctor
- **AND** 只有 retained package/runtime identity 匹配且专项验证通过后，Task Environment authority 才 MUST 被报告为正式生效

### Requirement: 产品验证必须覆盖 Environment authority 迁移与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、Runtime/CLI/依赖准备、runtime projection、Task-scoped Change 解析、Local App Environment inspect、资源登记、串行恢复、Finish cleanup handoff、明确放弃与一次性 legacy migration，并 MUST 证明旧新 authority 不会同时写入或路由。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、v2 receipt、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和下载缓存等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净 task checkout 没有 `node_modules` 且候选 CLI probe 失败
- **THEN** retained stable controller MUST 使用 Workspace Node/npm 与 checkout 自己的 lockfile 完成 `npm ci` 后重新 probe
- **AND** verifier MUST 证明 retained/peer `node_modules` 未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** receipt、其他 previews、默认 Local App 与其他任务 MUST 保持不受影响

#### Scenario: active legacy receipt 迁移
- **WHEN** fixture 具有正式 Task、真实 registered worktree 和 identity-matching v1 receipt
- **THEN** retained new version MUST 生成 v2 Environment Receipt 与窄 Git evidence，再移除旧 receipt/adoption state
- **AND** 迁移后所有正式 consumer MUST 只读取新 Environment authority

#### Scenario: orphan、stale 与 conflicting legacy receipt
- **WHEN** fixtures 分别覆盖无 Task 的 live worktree、没有 live resource 的 receipt 与 identity/ownership 冲突
- **THEN** verifier MUST 证明前两类只保留必要 Git evidence或删除陈旧 receipt，且不会创建 Task/v2 Receipt；冲突类 MUST 原样保留并阻止 authority 切换
- **AND** 正常 CLI/Application/runtime routing MUST 不存在 permanent legacy inspect/cleanup adapter

#### Scenario: Task-scoped Change 与 Local App Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止双 authority 回退
- **WHEN** package/static/runtime verification 发现旧 contract/binding、旧 environment writer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在明确 migration module/fixture 与 OpenSpec delta/history，Buildr MUST NOT 把 reader 当作允许旧 mutation/routing 的理由

### Requirement: Package 必须原子交付 Task Review authority
Buildr package MUST 原子交付 `buildr.task-review/v1` contract、默认 `task-review` Skill、Task Review Domain/Application/repository、CLI/JSON、Local App Review API/Web assets、Task-scoped Planning Review route、workspace binding、runtime source mappings 与专项验证。任一 identity、version、provider、path、schema、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 安装或更新 workspace assets
- **WHEN** Buildr package 安装、更新或同步支持 Task Review 的 workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-review@1`、enabled/installed/optional 的 `task-review` provider 和 default binding
- **AND** runtime projection MUST 包含同一 contract/Skill identity，不得创建 planning-review/completion-review 两个 provider

#### Scenario: package/runtime parity
- **WHEN** Task Review 从 source checkout、package checkout 或 npm tarball 执行
- **THEN** 三者 MUST 产生等价的 persisted Result、operation JSON、CLI help、Local App read model 和 target applicability

#### Scenario: Task Review 资产不完整
- **WHEN** contract、Skill、manifest/binding、Application/CLI、JSON registry、Local App route 或 tests 任一缺失/漂移
- **THEN** package check/doctor MUST 报告 blocked，MUST 不把 capability 描述为 ready 或正式生效

### Requirement: Package residual gate 防止 Task Review 与 Retrospective 双 authority
Buildr package verification MUST 区分 Task Review、普通 Change review 与 Task Retrospective，并 MUST 拒绝任何第二个正式 Task Review writer/store、按类型拆分的 capability、Task Record/Environment Review 字段或绕过 Application 的 Task-scoped review route。

#### Scenario: Task Retrospective 保持独立
- **WHEN** package 同时包含`task-review`与`task-retrospective`
- **THEN** capability graph MUST显示不同contract identity、provider、store与consumer purpose
- **AND** 两者 MUST不互写 Result 或互为 lifecycle dependency

#### Scenario: Task-scoped route 仍使用普通 Change review
- **WHEN** Local App 或 Agent action 在明确 Task context 下仍生成不记录 Planning Result 的旧通用 Change review prompt
- **THEN** residual gate/browser contract MUST 失败

#### Scenario: sibling records 受到写入影响
- **WHEN** Task Record、Environment、Task Review或Task Retrospective repository写入同一Workspace SQLite
- **THEN** 专项 fixture MUST证明每个writer只替换自己的精确current row并保留其他专业records

### Requirement: 候选 Task Review authority 必须在 retained cutover 前保持隔离
Task worktree 中新增的 Task Review Skill、CLI、Application 或 runtime assets MUST 只在该任务验证工作区和临时 Workspace 中验证；它们 MUST NOT 写 retained Workspace 的 Review Result、替换正式 runtime 或宣称 selected authority 已切换。只有候选集成、retained source sync/render/doctor 和真实 E2E 成功后，P0.3 authority 才 MUST 被报告为生效。

#### Scenario: 自举候选执行验证
- **WHEN** candidate CLI/Skill 在 Task Environment 中接受测试
- **THEN**测试 MUST 使用 task worktree 内 fixture/临时 Workspace 和候选 runtime
- **AND** retained/peer Task records、Review Results、runtime 与主 checkout MUST 保持不受影响

### Requirement: Package residual gate 必须防止 Task Verification 双 authority
Buildr package verification MUST 静态证明 Result persistence writer 只有 Task Verification Application 一个调用方，CLI 与 Local App 不直接读写 YAML，Task Record/Environment/Review/Finish 不复制 Result fields，并 MUST 拒绝 source、manifest、docs、tests 或 generated package 中仍被默认流程引用的 v2/v1 lifecycle authority。

#### Scenario: 检查唯一 writer
- **WHEN** package verifier 扫描 Product source
- **THEN** `writeTaskVerificationResultPersistence` 的调用方 MUST 精确为 Task Verification Application
- **AND** CLI、Local App 与 Finish MUST 只调用 Application methods

#### Scenario: 检查残留旧 authority
- **WHEN** package verifier 扫描受管 runtime assets、canonical docs 与公开 CLI
- **THEN** 不得存在 `buildr.task-verification/v2`、`project-verification/v1`、requiredAssurance、minimal/affected/candidate Result 层级或 direct verification summary consumer
- **AND** Product 内部测试 profile 中的 `candidate` 名称 MAY 保留，但 MUST 与 Task Verification declaration/Result authority 明确隔离

### Requirement: Package 必须原子交付唯一 Git Operations 能力
Buildr package MUST 原子交付一个 `git-operations` workspace Skill、一个 `buildr.git-operations@1` contract 和一个默认 binding，并 MUST 在同一 cutover 删除旧 Git capability graph。`buildr.git-worktree-provider@1` MUST 保持独立。

#### Scenario: 默认 graph 只有一个 Git Operations 入口
- **WHEN** package check、doctor 或 runtime render 解析默认 capability graph
- **THEN** graph MUST 只让 `git-operations` provide `buildr.git-operations@1` 并成为其默认 binding
- **AND** `task-finish` MUST 只以 optional mode require 该 capability，产品入口 MAY 按命中意图动态消费它

#### Scenario: 旧 graph residual gate
- **WHEN** package static verification 扫描 current manifests、Skill sources、contracts、bootstrap/docs 和 executable tests
- **THEN** `git-ops`、`buildr.git-single-operation`、`buildr.git-task-integration` 与 `buildr.git-workspace-update` 的 active provider、consumer、binding、router 和 schema residual MUST 为零
- **AND** archive 历史 MAY 保留旧事实但 MUST NOT 被 runtime 或 current docs 解析为可用入口

#### Scenario: Worktree provider 保持独立
- **WHEN** Task Environment 准备 Git checkout
- **THEN** `task-worktree` MUST 继续独立 provide `buildr.git-worktree-provider@1`
- **AND** `git-operations` MUST NOT 接管 worktree create、registration、Environment ready 或 cleanup authority

#### Scenario: Git Operations 安全语义被打包验证
- **WHEN** Buildr 验证随包 `git-operations` Skill 与 contract
- **THEN** verification MUST 覆盖独立 commit、独立 push、commit+push、无关 dirty、scope 外 unpublished commits、push rejection、共享 commit 冻结和部分失败 evidence
- **AND** verification MUST 确认该能力没有 Application、CLI、Receipt、持久状态或通用 Git transaction

### Requirement: 当前 package 不得为未来 Task Finish adapter 预建选择框架
Buildr package、capability graph、runtime source与verification registry MUST在只有当前Product/Git adapter时保持单一`buildr.task-finish/v1`provider与直接Application registration。没有第二种满足真实consumer、delivery target、equivalence、authorization、cleanup eligibility和独立E2E的adapter时，package MUST NOT新增adapter registry、adapter capability family、plugin selection metadata、Finish Receipt或平行run store。

#### Scenario: 当前 package 解析 capability graph
- **WHEN** doctor或package check解析Task Finish provider与consumer topology
- **THEN** graph MUST只显示current`task-finish`provider及其Development/Environment/optional Git Operations dependencies
- **AND** MUST NOT出现未被真实delivery path消费的adapter selector、provider family或第二Finish authority

### Requirement: Package verification 必须保护 OpenSpec checklist 与 lifecycle authority parity
Buildr package、workspace source与rendered runtime MUST投射一致的OpenSpec propose/update/apply contributions，并通过static/contract verification拒绝Task Finish convergence/archive旧authority和post-archive lifecycle checkbox引导。Package verification MUST证明convergence的未完成checklist门禁存在，并 MUST证明current runtime、capability graph和帮助文本不再包含Task Metadata Publication provider、binding或consumer route。

#### Scenario: 校验OpenSpec Component contributions
- **WHEN** verifier检查package source、workspace Component source与rendered OpenSpec Skills
- **THEN** 三者 MUST一致声明Change checklist的pre-disposition边界和未完成项fail-closed要求
- **AND** current assets MUST不包含“Task Finish执行或拥有OpenSpec convergence/archive”的可用路由

#### Scenario: 校验Metadata Publication清退
- **WHEN** verifier扫描package source、workspace/runtime manifests、capability graph、help与executable tests
- **THEN** Task Metadata Publication provider、contract、binding、helper与consumer route MUST全部不存在
- **AND** Task current records MUST不进入Git，且 MUST不新增archive reconciliation、checklist writer或第二份lifecycle状态

### Requirement: Package 不得继续发布退役的静态 Task Board
Buildr package、workspace baseline、bootstrap contract、runtime navigation 与 static validation MUST NOT 声明或要求 `task-board` Skill、`buildr.task-board-maintenance/v1` contract、provider、binding 或 HTML template；package check MUST 继续保证其他已声明能力的 manifest-first 完整性。

#### Scenario: 校验当前 package
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Task Board Skill、contract、binding、template 与专属 validation MUST 不在当前 package graph 中
- **AND** 其他 builtin replacement、capability contract 与 provider validation MUST 继续生效

#### Scenario: 构建 runtime 投射
- **WHEN** Buildr 从当前 package 渲染或同步 Agent runtime
- **THEN** runtime MUST NOT 发现 `task-board` 入口或 Task Board capability metadata
- **AND** Task、Parent/Child 与专业 read model 的当前能力 MUST 不受影响

### Requirement: 产品验证必须覆盖 Task Finish render 与自举 Workspace 组合边界
Buildr package、runtime parity与Task Finish executable verification MUST证明通用Task Finish只选择`none | render-runtime`，Workspace根runtime source任务只render且其他任务none。验证 MUST同时证明自举Component以`task-finish@append`组合Skill、Contribution、完整性和runtime结果，但 MUST NOT让通用Skill声明自举slot，或把该Workspace资产重新描述为用户Workspace默认能力或Formal Finish product hook。

#### Scenario: 校验通用两种activation模式
- **WHEN** verifier分别构造普通代码与Workspace根Skill Task Contribution
- **THEN** Task Finish plan MUST分别选择`none`与`render-runtime`
- **AND** package/static/runtime parity MUST拒绝Project activation declaration、`sync-workspace`和通用sync执行分支

#### Scenario: 校验普通Workspace不会sync
- **WHEN** fixture在用户Workspace修改Skill source并让runtime具备可执行Buildr CLI
- **THEN** executable test MUST观察到render与Doctor但零sync、零Builtin source变化和零tracked delta
- **AND** Environment cleanup MUST只在render通过后发生

#### Scenario: 校验自举Component组合
- **WHEN** 当前Buildr Workspace安装`buildr-self-bootstrap` Component并render当前Agent runtime
- **THEN** Component check MUST证明专属Skill和Contribution完整，且有效`task-finish`末尾包含append片段
- **AND** 未安装该Component的临时用户Workspace MUST不包含自举Skill、片段或通用自举slot

#### Scenario: 校验render失败边界
- **WHEN** fixture制造render tracked delta或Doctor失败
- **THEN** verifier MUST断言对应fail-closed code与精确paths/evidence
- **AND** MUST断言零自动sync、暂存、提交、stash、reset、rebase、merge、force push或Development rebuild

### Requirement: Buildr package 必须一致交付 Component dependency contributions
Buildr package MUST让 Component definition、builtin descriptors、workspace source、runtime resolver、Doctor和验证 fixtures 对结构化 Skill dependency contributions 保持一致，并 MUST避免把 Component-owned dependencies 重复维护在 package builtin `requires` 中。

#### Scenario: 安装带 dependency contribution 的 Component
- **WHEN** package install或sync安装enabled Component及其成员Skills/fragments
- **THEN**目标 Skills的runtime projection和capability graph MUST包含Component definition声明的effective dependencies
- **AND**workspace Skill manifest MUST保持Skill资产登记而不复制Component-owned dependency authority

#### Scenario: 卸载 Component
- **WHEN** Component lifecycle安全卸载或disable该Component
- **THEN**其fragments与dependency contributions MUST同时从后续runtime assembly和graph消失
- **AND**base Skill及其他Components的requires MUST保持不变

#### Scenario: Package source/runtime parity
- **WHEN** package verification检查OpenSpec Component
- **THEN**它 MUST验证propose/apply/update的required/optional graph、sync/archive的无Task依赖拒绝route、apply proposal gate及Component integrity
- **AND**任何definition、builtin descriptor、workspace projection或rendered runtime漂移 MUST fail closed

### Requirement: Buildr自举Component必须统一执行post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST在Formal Task Finish成功后通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费成功Finish Result中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development CLI install、development Local App install与最终Doctor；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Local App正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不执行sync、CLI install或Local App install

#### Scenario: CLI影响路径
- **WHEN** Formal Finish成功且冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node/CLI identity安装development CLI并运行Doctor
- **AND** Formal Finish本身 MUST观察到CLI installer调用次数为零

#### Scenario: Local App影响路径
- **WHEN** Formal Finish成功且冻结Task Contribution命中Buildr Local App正式影响路径
- **THEN** self-bootstrap activation MUST去重满足CLI依赖并安装development Local App，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Local App

#### Scenario: package workspace inputs
- **WHEN** 冻结Task Contribution命中package manifest或workspace package targets
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push、远端回读与最终Doctor完成收敛
- **AND** package sync MUST不与CLI或Local App分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Local App路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、CLI install、Local App install和最终Doctor
- **AND** MUST不启动第二个orchestrator或持久化新的workflow state

### Requirement: 用户Workspace不得包含或感知Buildr自举activation
Buildr package与runtime projection MUST让未安装`buildr-self-bootstrap` Component的用户Workspace保持无self-bootstrap Skill、Contribution、slot、路径分类、installer或launcher副作用。通用`task-finish` Skill与Product executor MUST不依赖该Component或专属Skill。

#### Scenario: 临时用户Workspace投射Task Finish
- **WHEN** package fixture初始化并render未安装self-bootstrap Component的用户Workspace
- **THEN** runtime MUST包含共用Task Finish且不包含self-bootstrap Skill、Contribution或命名slot
- **AND**普通Project或Service源码任务 MUST不安装或更新Buildr产品

#### Scenario: Buildr自举Workspace投射Component
- **WHEN** 当前Buildr自举Workspace检查并render已安装的`buildr-self-bootstrap` Component
- **THEN** Component integrity MUST证明专属Skill与Contribution完整，且有效Task Finish末尾包含post-Finish activation片段
- **AND** package/runtime parity MUST证明该组合未进入用户package默认能力

### Requirement: self-bootstrap activation evidence必须逐动作可诊断且不建立新authority
self-bootstrap activation MUST报告冻结输入、路径分类、去重动作计划、每个实际命令的身份与结果、push/readback和最终Doctor。该evidence MUST只作为当前post-Finish执行报告，不得写入SQLite、Task Record、Development Receipt、Review/Verification Result、Finish JSON或新的聚合store。

#### Scenario: activation全部通过
- **WHEN** 所有适用self-bootstrap动作与最终Doctor通过
- **THEN** Agent MUST报告每个动作的`passed|not-applicable`、retained commit/CLI/launcher identity与Doctor evidence
- **AND** MUST能证明没有新增authority、store或writer

#### Scenario: activation中途失败
- **WHEN** 任一适用动作失败
- **THEN** 后续不安全动作 MUST停止，并返回已完成动作、失败动作、冻结输入与精确恢复事实
- **AND** MUST不撤销或改写已经complete的Formal Finish

### Requirement: 产品验证必须覆盖已包含交付与post-Finish自举
Buildr package与runtime verification MUST覆盖Task Finish `already-contained` target disposition和自举Workspace post-Finish activation，并证明普通用户Workspace、通用Task Finish Skill和Product executor不获得self-bootstrap专属依赖或Component诊断分支。

#### Scenario: 验证 already-contained 快速完成
- **WHEN** integration fixture先交付carrier，再以保留全部carrier changed path after states的后续commit推进target
- **THEN** verifier MUST观察到零Task Contribution reapply、零新carrier commit、零Formal Verification execution和成功cleanup
- **AND** Result MUST包含ancestor/path-state containment evidence、原carrier ref和最新final remote ref

#### Scenario: 验证同路径变化仍fail closed
- **WHEN** 后续target commit改变任一carrier-owned path或无法读取target identity
- **THEN** verifier MUST观察到现有target-race或Delivery Adaptation路径
- **AND** MUST NOT观察到`already-contained`、自动冲突解决、Candidate rebuild或force push

#### Scenario: 验证自举只在Formal Finish后激活
- **WHEN** Buildr自举fixture的Formal Finish成功且冻结Task Contribution命中自举影响路径
- **THEN** verifier MUST观察到Finish五阶段先完成，随后单一post-Finish activation按路径去重执行适用动作与最终Doctor
- **AND** Formal Finish MUST不执行package sync、development CLI install或development Local App install

#### Scenario: 验证普通 Workspace 不采用自举activation
- **WHEN** 未安装`buildr-self-bootstrap` Component的临时Workspace完成相同Formal Finish
- **THEN** Task Finish MUST保持通用Result、Doctor与cleanup行为
- **AND** runtime/package MUST不存在self-bootstrap slot、隐式dependency、路径分类或executor特判

### Requirement: Package 必须统一排除 Task 本机目录
Buildr package、Workspace 初始化与 Workspace sync MUST 统一维护根 `.gitignore` 中的 `/.buildr/tasks/`，使 Task Environment Receipt 与 inert legacy records 保持 Workspace-local。维护 MUST 采用保留用户内容的幂等追加语义，不得借此修改 Git index 或删除旧记录。

#### Scenario: 初始化新 Workspace
- **WHEN** 用户使用 current package 初始化新的 Workspace
- **THEN** 默认 package baseline 与初始化结果的根 `.gitignore` MUST 包含且只追加一次 `/.buildr/tasks/`
- **AND** MUST NOT 依赖某个 Task 已经存在才补齐规则

#### Scenario: 同步已有 Workspace
- **WHEN** 已有 Workspace 运行 `buildr sync <agent>` 且尚无 broad Task ignore entry
- **THEN** Buildr MUST 向根 `.gitignore` 追加 `/.buildr/tasks/`
- **AND** MUST 保留已有精确 `environment.json` 规则、用户规则、注释和其他 bytes

#### Scenario: 重复同步
- **WHEN** 已有 Workspace 已包含 `/.buildr/tasks/` 并再次运行 sync
- **THEN** Buildr MUST NOT 生成重复条目或无关 `.gitignore` 改写

#### Scenario: 旧 Task YAML 已被 Git 跟踪
- **WHEN** Workspace Git index 已跟踪 `.buildr/tasks/` 下的历史文件
- **THEN** init 或 sync MUST NOT 自动执行 `git rm --cached`、删除或改写这些文件
- **AND** broad ignore entry MUST 只影响 Git 对未跟踪路径的发现

### Requirement: Package 原子交付 Task Retrospective 第一版
Buildr package MUST 原子交付 `buildr.task-retrospective/v1` contract、默认 provider、内部 driver、workspace binding、产品入口路由以及 Local App 只读投影，并 MUST 不建立任何 lifecycle consumer dependency。

#### Scenario: Package 安装 Task Retrospective
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v1 contract 与完整 `task-retrospective` Skill
- **AND** default binding MUST 指向该 provider

#### Scenario: Package 校验第一版边界
- **WHEN** Agent 运行 package check 或产品 affected verification
- **THEN** verifier MUST 检查 contract、provider、binding、driver、SQLite migration/repository、Local App read-only route 和 Result closed schema
- **AND** verifier MUST拒绝history、自动采集、公共CLI、写UI或lifecycle gate

### Requirement: Package 完整退役当前 Task Asset Review 能力
Buildr package 与 active product source MUST 删除 `task-asset-review` provider、全部 capability contract versions、binding、helper、templates、consumer requirements、routing 和专项 mutation tests；历史 archives 与用户 `.buildr/asset-review/` 数据 MUST不在退役范围内。

#### Scenario: 新 workspace 不再安装旧能力
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** runtime MUST不包含`task-asset-review` Skill、contract或binding
- **AND** doctor MUST不报告该能力的ready、degraded或blocked状态

#### Scenario: 升级 workspace 保留旧 observation 数据
- **WHEN** update/sync 前 canonical Workspace 存在`.buildr/asset-review/`文件
- **THEN** package operation MUST不读取、迁移、覆盖或删除这些文件
- **AND** `.gitignore` MAY继续保留旧目录排除规则
