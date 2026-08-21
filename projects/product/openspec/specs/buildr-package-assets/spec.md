# Buildr package assets 规范

## Purpose

定义 Buildr 产品随包资产、package manifest、默认 workspace baseline 和 package check 的边界。
## Requirements

### Requirement: package manifest 声明产品内置 Agent Skills
在 Agent Assets Contribution 完成前，Buildr 的资源 manifest MUST 显式声明产品随包内置 Agent Skills，并将产品 Skill 定义与用户 Workspace `skills/manifest.yml` 分离；其源 MAY 暂时位于 deferred `package/targets/runtime/skills/<skill-id>/`。

#### Scenario: 声明 agentSkills
- **WHEN** Buildr 产品包包含内置 Agent Skill
- **THEN** `resources/manifest.yml` MUST 通过专用字段声明 Skill id、源路径和适用 runtime
- **AND** 源路径 MUST 位于已登记的 deferred runtime Skill subtree

#### Scenario: agentSkills 不参与 init baseline
- **WHEN** Agent 执行 `buildr init`
- **THEN** manifest 中声明的产品入口 Agent Skills MUST NOT 被复制到目标 workspace `skills/` 目录
- **AND** Workspace `skills/manifest.yml` MUST 由 writer 使用真实 Workspace identity 生成，并由 Builtin/Component 声明收敛

#### Scenario: package check 校验内置 Agent Skills
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 manifest 声明的产品内置 Agent Skill 源路径存在
- **AND** Buildr MUST 校验该 Skill 不包含 forbidden patterns
- **AND** Buildr MUST 校验该 Skill 具备可渲染的 `SKILL.md`

#### Scenario: package check 校验 bootstrap 入口契约
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 从产品源码和正式 docs 校验 bootstrap guide 与 Buildr Skill 恢复契约
- **AND** MUST NOT 要求已删除的 `package/bootstrap/` 文字资产存在

### Requirement: package baseline 支持命令行工具清单入口
Buildr MUST 通过 Commands Domain writer 为默认 Workspace 生成命令行工具清单入口，而不得发布用户态 `commands/manifest.yml` 源。

#### Scenario: 初始化命令行工具清单入口
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 在 Workspace 中生成 `commands/manifest.yml` 或等价命令行工具清单入口

#### Scenario: 默认命令行工具清单为空
- **WHEN** Buildr 当前没有随包提供默认外部命令行工具声明
- **THEN** Commands Domain writer MUST 初始化空的命令行工具清单
- **AND** 默认清单 MUST NOT 声明 Buildr 自身为 Workspace 命令行工具资产

#### Scenario: package check 校验命令行工具清单入口
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 Commands Domain writer 可以在临时 Workspace 生成命令行工具清单入口
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
Buildr package manifest MUST 声明可同步到用户 workspace 的产品内置 Rules、Skills、Commands 和 Skill capability contracts，并提供旧 workspace 安全采用所需的官方完整性证据。Capability retirement entry MAY declare `legacyIntegrities`，用于登记已由产品发布过的历史 contract bytes；该白名单 MUST 只接受显式、可审计的 SHA-256 值。

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
- **WHEN** Buildr 需要让旧 workspace 安全退休历史 capability contract
- **THEN** retirement entry MUST 保留当前 `integrity` 并 MAY 声明 `legacyIntegrities`
- **AND** 每个 legacy integrity MUST 是随既有 Buildr package 发布过的官方 contract bytes 的 SHA-256
- **AND** legacy integrity MUST 只用于证明官方历史内容，不得作为未知用户修改的通配绕过

#### Scenario: package check 校验内置能力
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Buildr MUST 校验已声明的内置能力源路径
- **AND** Buildr MUST 校验 forbidden patterns、必需 Skill 文件、manifest entry 结构、目标路径安全性、legacy integrity 格式及身份唯一性
- **AND** Buildr MUST 校验每个 `legacyIntegrities` 是有效 SHA-256、与当前 integrity 不重复且在同一 retirement entry 内不重复
- **AND** Buildr MUST validate every contract reference、initial default binding、provides/requires version and dependency mode

#### Scenario: 旧 workspace 使用已知历史 contract
- **WHEN** sync 读取 retirement target，文件 hash 等于当前 `integrity` 或该 entry 声明的 `legacyIntegrities`
- **THEN** Buildr MUST 将文件识别为可安全退休的受管官方内容
- **AND** MUST 按 retirement plan 移除受管旧 contract/provider/binding source
- **AND** MUST 不读取、覆盖或删除 `.buildr/asset-review/` observation/history 数据

#### Scenario: 未知 contract drift 继续阻塞
- **WHEN** sync 读取 retirement target，文件存在但 hash 不等于当前 `integrity` 或任一 `legacyIntegrities`
- **THEN** Buildr MUST 返回 capability retirement drift 并 fail closed
- **AND** MUST 在 source mutation、retirement deletion 和 runtime projection 前停止

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
Buildr package assets MUST 将 Rule manifest consumption protocol 与通用 Rule/Skill 权威边界保留在 required Buildr Core 中，同时 MUST 将 task-triggered professional procedures 和专业状态事实保留在对应 Skills、capability bindings、Applications 或 Project declarations 中。

#### Scenario: Package Core 声明 Rule 状态语义
- **WHEN** Buildr packages or validates `rules/buildr/core.md`
- **THEN** required Core MUST state that enabled、required and installed Rules are always read
- **AND** required Core MUST state that enabled optional installed Rules are selected semantically from description and task context
- **AND** required Core MUST state that disabled or uninstalled Rules do not participate in the task

#### Scenario: Package Core 限定 scope Rules 内容
- **WHEN** required Core 说明 root、Project 或 Service `AGENTS.md` 可以增加的 scope-specific 内容
- **THEN** Core MUST 将其限制为价值观、权威边界、授权边界、约束和结果不变量
- **AND** Core MUST NOT 让这些 Rules 承担 Skill routing、命令序列、生命周期步骤、重跑/恢复策略、报告模板或专业 Result/status 副本

#### Scenario: Rule 只声明专业 owner
- **WHEN** root、Project 或 Service Rule 需要约束某项专业动作不得被绕过
- **THEN** required Core MUST allow the Rule to name the owning Skill、capability、Application or declaration and state the no-bypass invariant
- **AND** Skill description MUST remain the user-intent discovery authority
- **AND** capability binding MUST remain the provider-selection authority
- **AND** the owning Skill/Application MUST remain the procedure and professional-result authority
- **AND** the Rule MUST NOT copy that owner's playbook or current state

#### Scenario: Package Core 不承载操作手册
- **WHEN** Buildr packages Rule consumption guidance
- **THEN** required Core MUST NOT copy task-specific Git、OpenSpec、worktree or other operational procedures
- **AND** required Core MUST NOT state that Project or Service Rules may own concrete task procedures
- **AND** reusable task procedures MUST remain available through the corresponding Skills

### Requirement: 产品验证覆盖提交信息资产边界
Buildr product verification MUST 防止提交格式与 workspace 默认语言重新耦合到同一 Skill 生命周期。

#### Scenario: 校验 Git Ops 提交格式
- **WHEN** Buildr validates the packaged Git Operations Skill
- **THEN** verification MUST confirm the concise Conventional Commits format、supported types、optional scope and breaking-change guidance
- **AND** verification MUST confirm Git Operations follows the current workspace、Project、Service and repository language conventions without creating a competing language default

#### Scenario: 校验 Core 默认提交语言
- **WHEN** Buildr validates the default package and a temporary initialized workspace
- **THEN** verification MUST confirm required Core does not own the commit-language default and the rendered workspace `AGENTS.md` contains the concise Chinese default and allowed original-form exceptions
- **AND** verification MUST confirm the workspace default remains present when Git Operations is absent

#### Scenario: 校验提交消费者组合
- **WHEN** Buildr validates Git Operations、Task Finish and other packaged commit-producing consumers
- **THEN** verification MUST confirm each consumer reads the current workspace language convention
- **AND** verification MUST NOT require Core to own or duplicate the commit-language default

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
Buildr 产品总验证 MUST覆盖deterministic convergence、事务期Convergence Inspect、上游兼容性和candidate tree的Canonical Specs变更关联。正常候选验证 MUST使用同一candidate中的Archived Change delta与canonical文件事实，不得要求tracked active/archive Convergence Receipt或创建替代审计记录。

#### Scenario: 门禁 fixture corpus
- **WHEN** 产品验证运行OpenSpec contract fixtures
- **THEN** 验证 MUST覆盖安全ADDED、MODIFIED、REMOVED和RENAMED收敛，以及未开始、before、expected、mixed/unknown和archived Inspect边界
- **AND** 验证 MUST覆盖proposal/delta不一致、active Change冲突、delta后改动、未触达Requirement被破坏、Receipt释放和归档后`not-applicable`

#### Scenario: Product candidate 修改 canonical specs
- **WHEN** Product Project的candidate Git tree包含canonical Requirement变化
- **THEN** 产品验证 MUST证明每个变化capability能够关联到同一candidate中归档Change的delta语义，并要求`openspec validate --all --strict`通过
- **AND** 缺少对应Archived Change、delta与canonical事实不匹配或只有strict validation通过 MUST被拒绝

#### Scenario: Candidate不包含Convergence Receipt
- **WHEN** 正常Converge已成功归档并释放本次Receipt
- **THEN** 产品候选与package验证 MUST在没有tracked Convergence Receipt时通过既有Archived Change/canonical门禁
- **AND** MUST NOT扫描Worktree外路径、恢复已清理Receipt或把Receipt复制到新的store

#### Scenario: OpenSpec Component 上游升级
- **WHEN** package中声明的OpenSpec upstream version变化
- **THEN** package check和产品验证 MUST对该版本运行contract fixture corpus
- **AND** 未经支持或fixture失败 MUST阻止package verification通过

#### Scenario: Runtime 投射门禁 Skill
- **WHEN** 临时Workspace初始化、update或sync支持的Agent runtime
- **THEN** 产品E2E MUST验证`openspec-contract-guard`随OpenSpec Component物化并投射
- **AND** OpenSpec Component被显式卸载时该Skill MUST随集合安全移除

#### Scenario: Runtime 组合和移除门禁 Contribution
- **WHEN** 临时Workspace对支持的Agent安装或卸载OpenSpec Component
- **THEN** 产品E2E MUST验证安装后的workflow Skills获得current Converge/Convergence Inspect边界
- **AND** 卸载后 MUST不残留Buildr-owned contribution或旧`openspec audit`调用

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
- **THEN** verifier MUST 覆盖 Result closed schema、atomic replacement、current/stale/unknown、transient execution separation、coverage gap、Buildr Web read-only 和 Finish shared consumer
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

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 task-triage 提供 optional `buildr.task-record@2` consumer edge。todo 创建分支 MUST 只调用 Task Record provider；active 创建或 todo 激活分支 MUST 在首次正式执行写入前完成 Git Operations 基线门禁，再调用 selected provider。

#### Scenario: 检查 capability graph
- **WHEN** package verification 检查当前 capability graph
- **THEN** graph MUST 包含 `buildr.task-record@2`、default task-manager provider/binding 和 task-triage optional consumer edge
- **AND** MUST NOT给专业阶段增加 Task Record consumer edge

#### Scenario: todo data-only 分支
- **WHEN** 用户只接受未启动意向
- **THEN** task-triage MUST 创建 todo Task 而不消费 Git Operations
- **AND** MUST 不创建 Environment、Change 或专业 placeholder

#### Scenario: 正式分支 provider 不 ready
- **WHEN** active 创建或 todo 激活所需 provider/Git baseline blocked
- **THEN** execution/write 分支 MUST fail closed 并报告 next action
- **AND** todo MUST 保持原状态且语义分流结果可见

#### Scenario: 旧专业模块继续运行
- **WHEN** active Task 调用 worktree、Verification、Task Finish 或其他专业路径
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

### Requirement: Package 必须原子交付 Task Review authority
Buildr package MUST 原子交付 `buildr.task-review/v1` contract、默认 `task-review` Skill、Task Review Domain/Application/repository、CLI/JSON、Buildr Web Review API/Web assets、Task-scoped Planning Review route、workspace binding、runtime source mappings 与专项验证。任一 identity、version、provider、path、schema、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 安装或更新 workspace assets
- **WHEN** Buildr package 安装、更新或同步支持 Task Review 的 workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-review@1`、enabled/installed/optional 的 `task-review` provider 和 default binding
- **AND** runtime projection MUST 包含同一 contract/Skill identity，不得创建 planning-review/completion-review 两个 provider

#### Scenario: package/runtime parity
- **WHEN** Task Review 从 source checkout、package checkout 或 npm tarball 执行
- **THEN** 三者 MUST 产生等价的 persisted Result、operation JSON、CLI help、Buildr Web read model 和 target applicability

#### Scenario: Task Review 资产不完整
- **WHEN** contract、Skill、manifest/binding、Application/CLI、JSON registry、Buildr Web route 或 tests 任一缺失/漂移
- **THEN** package check/doctor MUST 报告 blocked，MUST 不把 capability 描述为 ready 或正式生效

### Requirement: Package residual gate 防止 Task Review 与 Retrospective 双 authority
Buildr package verification MUST 区分 Task Review、普通 Change review 与 Task Retrospective，并 MUST 拒绝任何第二个正式 Task Review writer/store、按类型拆分的 capability、Task Record/Environment Review 字段或绕过 Application 的 Task-scoped review route。

#### Scenario: Task Retrospective 保持独立
- **WHEN** package 同时包含`task-review`与`task-retrospective`
- **THEN** capability graph MUST显示不同contract identity、provider、store与consumer purpose
- **AND** 两者 MUST不互写 Result 或互为 lifecycle dependency

#### Scenario: Task-scoped route 仍使用普通 Change review
- **WHEN** Buildr Web 或 Agent action 在明确 Task context 下仍生成不记录 Planning Result 的旧通用 Change review prompt
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
Buildr package verification MUST 静态证明 Result persistence writer 只有 Task Verification Application 一个调用方，CLI 与 Buildr Web 不直接读写 YAML，Task Record/Environment/Review/Finish 不复制 Result fields，并 MUST 拒绝 source、manifest、docs、tests 或 generated package 中仍被默认流程引用的 v2/v1 lifecycle authority。

#### Scenario: 检查唯一 writer
- **WHEN** package verifier 扫描 Product source
- **THEN** `writeTaskVerificationResultPersistence` 的调用方 MUST 精确为 Task Verification Application
- **AND** CLI、Buildr Web 与 Finish MUST 只调用 Application methods

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
self-bootstrap activation MUST报告冻结输入、路径分类、去重动作计划、每个实际命令的身份与结果、push/readback、retained checkout显式开发入口identity和最终Doctor。Development entry evidence MUST包含Project bridge与Service CLI entry真实路径、Environment retained Node、预期及观测package/version/channel/source；MUST NOT读取、改变或要求PATH默认`buildr`。该evidence MUST只作为当前post-Finish执行报告，不得写入SQLite、Task Record、Development Receipt、Review/Verification Result、Finish JSON或新的聚合store。

#### Scenario: activation全部通过
- **WHEN** 所有适用self-bootstrap动作、显式开发入口identity与最终Doctor通过
- **THEN** Agent MUST报告每个动作的`passed|not-applicable`、retained commit、development entry、Node、package/version与Doctor evidence
- **AND** MUST能证明没有PATH默认CLI mutation、新增authority、store或writer

#### Scenario: activation中途失败
- **WHEN** 任一适用动作或显式开发入口identity验证失败
- **THEN** 后续不安全动作 MUST停止，并返回已完成动作、失败动作、冻结输入、入口链证据与精确恢复事实
- **AND** MUST不撤销或改写已经complete的Formal Finish

### Requirement: 产品验证必须覆盖已包含交付与post-Finish自举
Buildr package与runtime verification MUST覆盖Task Finish `already-contained` target disposition、正常post-Finish activation和retained Doctor blocked后的自举恢复，并证明普通用户Workspace、通用Task Finish Skill和Product executor不获得self-bootstrap专属依赖、路径分类或Doctor绕过分支。

#### Scenario: 验证 already-contained 快速完成
- **WHEN** integration fixture先交付carrier，再以保留全部carrier changed path after states的后续commit推进target
- **THEN** verifier MUST观察到零Task Contribution reapply、零新carrier commit、零Formal Verification execution和成功cleanup
- **AND** Result MUST包含ancestor/path-state containment evidence、原carrier ref和最新final remote ref

#### Scenario: 验证同路径变化仍fail closed
- **WHEN** 后续target commit改变任一carrier-owned path或无法读取target identity
- **THEN** verifier MUST观察到现有target-race或Delivery Adaptation路径
- **AND** MUST NOT观察到`already-contained`、自动冲突解决、Candidate rebuild或force push

#### Scenario: 验证自举只在Formal Finish后激活
- **WHEN** Buildr自举fixture的Formal Finish首轮成功且冻结Task Contribution命中自举影响路径
- **THEN** verifier MUST观察到Finish五阶段先完成，随后单一post-Finish activation按路径去重执行适用动作与最终Doctor
- **AND** Formal Finish Product executor MUST不执行package sync、development CLI install或development Buildr Web install

#### Scenario: 验证Doctor-blocked自举恢复
- **WHEN** 自举fixture在remote readback后让首次指定Agent Doctor失败，冻结贡献命中自举动作且append存在
- **THEN** verifier MUST观察到专属activation、同一run精确resume、最终指定Agent Doctor和之后的cleanup
- **AND** MUST观察到Candidate/generation、Formal Verification、Completion Review和handoff保持不变

#### Scenario: 验证普通 Workspace 不采用自举activation
- **WHEN** 未安装`buildr-self-bootstrap` Component的临时Workspace遇到相同指定Agent Doctor失败
- **THEN** Task Finish MUST保持blocked且不得进入cleanup
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

### Requirement: self-bootstrap 候选验收必须证明 canonical store 未受污染
Buildr package/runtime verification MUST 覆盖 self-bootstrap candidate 对 canonical Structured Store 的 provenance rejection、独立 validation store migration、CLI/HTTP/internal driver writer routing 与候选 Buildr Web smoke。验证 MUST 证明拒绝路径零 mutation，并明确区分 candidate validation evidence 与 retained runtime activation evidence。

#### Scenario: package fixture 运行 candidate migration
- **WHEN** verifier 用 task worktree candidate runtime 分别指向 canonical Workspace 与 receipt-bound Task Validation Workspace
- **THEN** canonical target MUST 被拒绝并保持数据库 bytes/ledger 不变
- **AND** validation target MUST 能从空库连续应用 candidate migration 并运行受影响测试

#### Scenario: 候选集成后激活
- **WHEN** 最终候选完成 required verification 并进入 retained checkout
- **THEN** activation/Doctor MUST 由 retained source 运行并报告 retained runtime identity
- **AND** MUST NOT 把 candidate validation database 或其数据当作 canonical activation result

### Requirement: Package 必须验证创建前 dev 基线收敛工作流
Buildr package verification MUST 覆盖随包 `task-triage` 在新正式 Task 创建前条件消费 `buildr.git-operations/v1`、收敛统一 `dev` 基线并保持 Task Record 与 Environment authority 分离的行为，且 MUST 验证 source、package manifest、capability graph 与 supported Agent runtime 的一致性。

#### Scenario: 随包 Skill 与 capability graph 一致
- **WHEN** Buildr 验证 workspace package 中的 `task-triage`、Git Operations contract/provider 和 Skill manifest
- **THEN** `task-triage` MUST optional 声明 `buildr.git-operations@1` dependency，并只在新正式 Task create 分支提升为 required
- **AND** package/runtime projection MUST 保持 provider、binding、description 与 consumer routing evidence ready

#### Scenario: 成功路径先收敛再创建
- **WHEN** fixture repository 处于 clean `dev` 且配置 `origin/dev`，并分别覆盖 aligned、behind 与未 push 本地 commit 分叉状态
- **THEN** verification MUST 证明 task-triage 依次完成 fetch/rebase、适用 transition check，再调用 Task Record create
- **AND** 创建出的 Task Environment checkout MUST 基于收敛后的 local `dev` identity

#### Scenario: 失败路径不创建 Task
- **WHEN** fixture 覆盖 dirty、错误 branch/upstream、fetch failure、rebase conflict、abort recovery 与 abort failure
- **THEN** verification MUST 证明 Task Record create 未执行，并核对实际 effects、current facts 与 blocker
- **AND** MUST 证明没有自动 stash、merge、force push、策略切换或把部分成功伪装为零 effect

#### Scenario: 专业 authority 保持分离
- **WHEN** verifier检查 Task Record CLI/Application、Buildr Web mutation 和 Task Environment provider
- **THEN** 它们 MUST 保持不执行创建前 fetch/rebase，Task Record schema 与 Environment Receipt MUST 不新增该 Git 编排状态
- **AND** 创建前收敛 MUST 只存在于 Agent `task-triage` consumer 与 selected Git Operations provider 的组合行为

### Requirement: Package residual gate 必须退役持久化 Task Lifecycle projection
Buildr package、checkout runtime、npm tarball与Workspace投射 MUST交付相同的专业current schema、Task Overview reader与terminal completion reader，并 MUST从latest runtime composition、source、manifest、docs与tests删除Task Lifecycle projection repository/application/writers。历史连续migration `0006_create_task_lifecycle_current.sql` MAY保留为升级链事实，但latest schema与可执行runtime MUST不存在`task_lifecycle_current` table dependency或projection method。

#### Scenario: 静态扫描 current runtime
- **WHEN** package verifier扫描runtime composition、Application/repository imports、Finish executor与专业writers
- **THEN** `registerTaskLifecycleRepository`、`registerTaskLifecycleReadModelApplication`、`read/update/inspect/projectTaskLifecycle*`与Finish lifecycle refresh调用 MUST全部不存在
- **AND** Task、Environment、Development、Review、Verification与Finish writer MUST只更新所属专业authority

#### Scenario: 检查 migration package
- **WHEN** package verifier检查checkout、tarball与初始化Workspace的migration assets
- **THEN** 三种入口 MUST包含完全一致且连续的退役migration，并动态从assets解析latest version
- **AND** verifier MUST NOT通过固定版本号或删除历史`0006`来表达latest schema

#### Scenario: 验证 Overview 与专业 reader parity
- **WHEN** checkout、npm tarball或Buildr Web读取同一Task的Overview、研发、证据、环境与terminal状态
- **THEN** 各入口 MUST从专业current/Finish completion返回等价摘要与缺失/冲突diagnostic
- **AND** GET MUST不创建数据库、应用migration、观察外部事实或写回任一row

#### Scenario: 验证既有用户数据库升级
- **WHEN** package verification从fresh、各旧ledger起点、完整/部分lifecycle与冲突fixture升级到latest
- **THEN** 可安全数据 MUST保留，latest schema MUST没有`task_lifecycle_current`，terminal association不匹配 MUST完整rollback
- **AND** 旧runtime读取升级数据库 MUST返回`database-newer-than-runtime`

### Requirement: Workspace 忽略本地 Agent runtime ownership receipts
Buildr package、Workspace 初始化与 Workspace sync MUST 幂等维护根 `.gitignore` 中的 `/.buildr/agent-runtime/`，使 workspace Skill projection ownership receipts 保持 Workspace-local。

#### Scenario: 新 Workspace 初始化
- **WHEN** Buildr 使用当前 package 初始化 Workspace
- **THEN** 根 `.gitignore` MUST 包含且只包含一次 `/.buildr/agent-runtime/`
- **AND** `.buildr/workspace.yml` MUST NOT 因此被忽略

#### Scenario: 现有 Workspace sync
- **WHEN** 已初始化 Workspace 缺少 `/.buildr/agent-runtime/` ignore 并运行 sync
- **THEN** Buildr MUST 以保留用户内容的幂等追加语义补齐该条目
- **AND** MUST NOT 修改 Git index 或删除已有 runtime receipts

#### Scenario: 重复 sync
- **WHEN** Workspace 已含 `/.buildr/agent-runtime/` 并再次运行 sync
- **THEN** Buildr MUST NOT 生成重复条目或无关 `.gitignore` 改写

### Requirement: Package必须完整交付Environment Preparation Declaration能力
Buildr package MUST原子交付Preparation Declaration schema/reference/template、Plan Request/Plan/Receipt contracts、`task-environment`与相关consumer guidance、CLI/Application runtime、Doctor和Buildr Web read model。package manifest MUST列出所有新增Skill companion files，runtime投射 MUST不依赖Product checkout外未发布文件。

#### Scenario: package check验证新增资产
- **WHEN** Agent运行`buildr package check`
- **THEN** package check MUST验证全部Environment Preparation Declaration companion files存在且受manifest管理
- **AND** 安装后Workspace MUST能让Agent读取模板、选择Recipe并调用公开CLI

### Requirement: Package 必须原子交付 Parent coordination 能力
Buildr package MUST原子交付Domain/Application、Development Receipt major兼容、CLI/HTTP/public JSON、Buildr Web build、Skills/contracts/bindings与专项验证；任一schema、registry、source/package/runtime parity或Application接线不一致 MUST fail closed。

#### Scenario: package source parity
- **WHEN** package verifier检查Parent coordination资产
- **THEN** source、package target与runtime投射identity MUST一致
- **AND** CLI与Buildr Web MUST绑定同一Application

### Requirement: Package验证必须拒绝重复authority
Package verification MUST拒绝新增Parent lifecycle/progress/event/history/audit表、`tasks`任意JSON/Child status array、GET filesystem scan、历史backfill/single-Task migration和Parent/Child相同delta双重owner。

#### Scenario: 静态与动态禁止项检查
- **WHEN** candidate包含SQLite migrations、repositories、HTTP readers或Skill流程变化
- **THEN** verifier MUST证明没有被禁止的store/writer/read fallback
- **AND** fresh Workspace与连续upgrade MUST保持旧Task absent-compatible

### Requirement: bootstrap 契约校验 adapter-neutral 产品 Skill
Buildr package bootstrap 契约 MUST 校验生成的产品入口 Skill包含宿主身份选择边界，并 MUST 拒绝把投射 adapter 注入为当前 Agent 身份或固定维护命令。

#### Scenario: package check 检查生成 Skill
- **WHEN** 维护者运行 `buildr package check`
- **THEN** package check MUST 验证产品入口 Skill要求从宿主明确身份或用户明确目标选择 `<agent>`
- **AND** MUST 验证生成 Skill 不包含“当前 Agent Adapter”或“当前安装 adapter”身份声明

#### Scenario: 所有 supported adapters 使用相同执行边界
- **WHEN** package contract 为所有 supported adapters 生成产品入口 Buildr Skill
- **THEN** 每份生成 Skill MUST 包含相同的 adapter-neutral 身份边界
- **AND** MUST NOT 因投射 adapter 不同而生成不同的默认维护目标

### Requirement: Package 原子交付 Task Retrospective v2
Buildr package MUST 原子交付 `buildr.task-retrospective/v2` contract、默认 provider、bundled `__internal task-retrospective` route、checkout薄driver wrapper、workspace binding、Task Record v2 consumer binding以及Buildr Web投影，并 MUST不建立lifecycle gate。受管consumer MUST通过retained controller invocation调用该route，npm artifact MUST不依赖发布包外的controller source root或`src/interfaces/internal`文件。

#### Scenario: Package 安装 Task Retrospective
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v2 contract 与完整 task-retrospective Skill
- **AND** default binding、Task Record consumer与内部route MUST指向兼容provider/runner

#### Scenario: Package 校验 v2 边界
- **WHEN** Agent 运行 package check、Doctor 或产品 affected verification
- **THEN** verifier MUST 检查contract、provider、binding、bundled route、SQLite repositories、Buildr Web route、Result schema与Task来源关系
- **AND** verifier MUST拒绝source-only consumer、history、自动采集、action item store、自动执行Task或lifecycle gate

### Requirement: Package 必须原子交付 todo Task 与复盘承接能力
Buildr package MUST 原子交付升级后的 Task Record 与 Task Retrospective contracts/providers、SQLite migration、Application/repository、CLI/help/JSON、Buildr Web API/Web assets、capability bindings 和验证。任一版本、状态、来源关系、runtime projection 或客户端行为漂移时 package check 与 Doctor MUST fail closed。

#### Scenario: 初始化新 Workspace
- **WHEN** 新 package 初始化 Workspace 并创建带多个来源的 todo Task
- **THEN** CLI、Application 与 Buildr Web read model MUST 返回一致的 v2 record、todo status 和来源关系
- **AND** filesystem 与其他专业 current tables MUST 保持无新增

#### Scenario: 迁移既有 Workspace
- **WHEN** migration 遇到现有 active/completed/abandoned Task 与 retrospective rows
- **THEN** 所有既有 Task status、result、scope、references 与复盘内容 MUST 原样保留
- **AND** MUST NOT从缺失 artifacts、pending disposition 或文本内容推断 todo/来源关系

#### Scenario: package/runtime parity
- **WHEN** verifier 比较 source、npm package、workspace runtime 与 Buildr Web bundle
- **THEN** contract major、Skill routing、CLI action/filter、JSON schema、migration 和 Web labels MUST 一致
- **AND** 旧 runtime 读取更新后的 store MUST 按现有 migration version 边界 fail closed

### Requirement: Buildr package 必须交付 Task Planning Identity consumer闭环
Buildr package MUST原子交付Task Planning Identity Domain/Application、runtime composition、bundled `__internal task-planning-identity`只读route、checkout薄driver wrapper、相关contracts/specs与更新后的`task-development`、`task-review`、OpenSpec propose/update/apply/contract-guard Skills。受管consumer MUST通过retained controller invocation调用resolver；Package static validation、Doctor与installed artifact contract tests MUST证明consumer使用resolver结果且不再指引Agent手工摘要OpenSpec planning target或直连source driver。

#### Scenario: Package 与runtime projection完整
- **WHEN** Buildr构建package并向Workspace投射Skills
- **THEN** bundled resolver route、结果契约和全部相关consumer指引 MUST同时存在且相互一致
- **AND** 任一缺失、source-only路径、旧手工摘要指引或版本接线漂移 MUST使package检查或Doctor失败

### Requirement: Package 必须原子交付 Buildr Web Task Manager 能力
Buildr package MUST 原子交付 Task Record Domain/Application/repository、`buildr.task-record/v2` capability contract、默认 `task-manager` provider、workspace binding、Skill source、CLI/help/runtime 接线、Buildr Web Task routes/API/Web assets 和公开 JSON identity；任一 identity、path、version、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 将包含 Task Manager 的 package 初始化或同步到 Workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-record@2` contract、`task-manager` Skill 与 default binding
- **AND** task-manager MUST 通过 `provides` 声明 `buildr.task-record@2`

#### Scenario: capability contract identity 不一致
- **WHEN** package manifest、workspace baseline manifest、contract frontmatter、provider provides 或 binding 对 capability id/version 的声明不一致
- **THEN** package check 和 doctor MUST 报告 identity integrity error
- **AND** runtime projection MUST NOT 猜测其中一份 identity 继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace 从已集成的产品 source 对支持的 Agent runtime 执行 sync/render
- **THEN** runtime MUST 收到完整 task-manager Skill、更新后的 task-triage 与受管 source/binding evidence
- **AND** doctor MUST 只在 contract、provider、consumer binding 和 runtime source 都可解析时报告 structurally ready

#### Scenario: bundled Buildr Web 加载 Task 页面
- **WHEN** checkout、npm tarball 或平台 bundle 启动 Buildr Web 并打开已登记 Workspace
- **THEN** server MUST 交付 Task route shell、Task Web feature 与对应 Workspace-scoped API
- **AND** Buildr Web 与 CLI MUST 绑定同一 Task Record Application，不得各自携带独立 validator 或 filesystem writer

### Requirement: task-manager routing 与 Buildr Web 职责边界必须由 package verification 保护
Buildr package MUST 让 task-manager frontmatter、package manifest 与 workspace baseline manifest 使用完全一致的单句 description，并 MUST 通过静态与行为 fixture 防止它退化为全局 dispatcher、专业阶段执行器或复盘分析 owner。

#### Scenario: routing description 正向覆盖
- **WHEN** fixture 表达创建、查看、更新、激活、结束 todo/active Task Record 或按 Task ID 恢复顶层事实
- **THEN** task-manager description MUST 覆盖该意图
- **AND** Skill 正文 MUST 要求使用 selected `buildr.task-record/v2` provider 和实际 result evidence

#### Scenario: routing description 负向覆盖
- **WHEN** fixture 只表达普通修复/实现意图、纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** package verification MUST 确认 task-manager 不自动创建 Task
- **AND** task-triage 或其他适用入口 MUST 不因新 Skill id 被遮蔽

#### Scenario: 专业职责渗入
- **WHEN** task-manager Skill 或 contract 包含 Environment 创建/记录、研发计划/实现、Review 判断、Verification 执行、Git policy、Finish 编排、Board 状态或复盘内容分析
- **THEN** package verification MUST 失败并报告越界内容
- **AND** provider MUST 只拥有 Task Record 六个 action、最小来源关系与结果证据

#### Scenario: Buildr Web 前端复制产品逻辑
- **WHEN** Task Web feature 自行实现状态迁移、关系校验或直接接受 filesystem path
- **THEN** package/static verification MUST 失败并报告重复 authority
- **AND** Web feature MUST 只调用登记的 Workspace Task API 并展示 Application result

### Requirement: Package 必须原子交付 Buildr Web Task Environment authority
Buildr package MUST原子交付`buildr.task-environment/v1` contract、Task Environment Application、Plan v1/Receipt v4 Domain、`task-environment` Skill、Plan/Environment公共CLI与JSON、v2/v3 compatibility reader、唯一SQLite writer、Task-scoped Change Resolver、Buildr Web saved-current reader/API、Git provider contract、bindings、runtime mappings与迁移验证。任一identity、schema、CLI、source/package/runtime或Buildr Web consumer不一致时package check与doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr初始化或同步包含Task Environment的Workspace
- **THEN** manifests MUST登记matching contract、provider和bindings
- **AND** MUST不交付Project dependency declaration parser或package-manager adapter registry

#### Scenario: capability graph 解析
- **WHEN** doctor解析task-triage、task-environment、task-worktree与task-finish
- **THEN** graph MUST显示正式workflow消费task-environment，Environment按需消费Git provider
- **AND** 旧capability、缺失provider、歧义或版本冲突 MUST产生精确诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** verification检查help、CLI和public JSON registry
- **THEN** Plan record/inspect及Environment prepare/inspect/cleanup MUST全部出现并匹配各自schema
- **AND** internal resource/saved-current actions MUST不出现

#### Scenario: Buildr Web只读保存事实
- **WHEN** checkout或npm tarball Buildr Web读取Environment
- **THEN** GET MUST通过Application展示v4 Plan/Service/Step facts或legacy diagnostic
- **AND** MUST不执行Step、文件系统probe或Receipt写入

#### Scenario: 候选package在隔离Workspace证明fresh依赖
- **WHEN** candidate CLI作为外部controller为fresh fixture携带包含buildr/buildr-web步骤的Agent Plan执行prepare
- **THEN** 一次prepare MUST产生两个独立Service Step outputs并使`npm run build:web`使用buildr-web lockfile工具成功
- **AND** 同一机制 MUST能执行非npm fixture step而无需新增技术栈adapter

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** Task worktree候选修改Plan、Receipt、CLI、Skill或Buildr Web assets
- **THEN** candidate MAY只向receipt绑定验证工作区投射
- **AND** MUST阻止retained、peer Task与验证根外共享runtime target

#### Scenario: 集成后激活
- **WHEN** 候选进入retained checkout
- **THEN** Agent MUST从retained Product source执行适用sync/render/doctor
- **AND** 只有package/runtime identity一致且专项验证通过后才能报告正式生效

### Requirement: Buildr 自举 Component 必须统一执行 Buildr Web post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费同一Finish run中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development Buildr Web install、retained checkout显式开发入口验证与最终Doctor/Finish resume；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献，也 MUST NOT安装、删除或验证PATH默认development CLI。Formal Finish首轮Doctor通过时activation位于complete之后；首轮Doctor blocked时，只有前序delivery/remote evidence、matching resume token和适用动作全部成立，activation才可以先修复retained状态并恢复同一run。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不覆盖Doctor failure、不执行sync、Buildr Web install、开发入口验证或PATH CLI mutation

#### Scenario: CLI影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node显式运行delivered retained checkout的`projects/product/buildr`并验证其identity
- **AND** 通用Product executor和self-bootstrap runner MUST观察到development CLI installer调用次数为零

#### Scenario: Buildr Web影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST安装development Buildr Web，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Buildr Web或PATH默认CLI

#### Scenario: package workspace inputs或Buildr runtime Skill source
- **WHEN** 冻结Task Contribution命中package manifest、workspace package targets或`package/targets/runtime/skills/buildr/**`
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push与远端回读完成收敛
- **AND** package sync MUST不与Buildr Web或开发入口分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Buildr Web路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、Buildr Web install、显式开发入口验证和最终Doctor或Finish resume
- **AND** MUST不启动第二个orchestrator、安装development CLI或持久化新的workflow state

#### Scenario: 默认CLI identity通过
- **WHEN** 任一self-bootstrap动作适用且所有适用安装动作已经完成
- **THEN** runner MUST以Environment retained Node显式执行retained `projects/product/buildr version --json`，并证明Project bridge、Service CLI entry、source与package/version属于本次delivered retained checkout
- **AND** runner MUST不解析或执行PATH默认`buildr`

#### Scenario: 默认CLI identity失败
- **WHEN** Project bridge缺失、不可执行、启动失败、未使用retained Node、source或CLI entry指向其他checkout、channel或package/version不一致
- **THEN** self-bootstrap activation MUST fail closed并停止最终Doctor或Finish resume
- **AND** Result MUST保留预期与观测入口、Node、package/version及精确恢复事实

#### Scenario: Doctor-blocked run恢复
- **WHEN** 同一run的前序交付完整、唯一失败为retained Doctor、存在matching resume token且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在动作和显式开发入口identity验证成功后，通过该retained Project bridge用token恢复同一Finish run，由resume中的指定Agent Doctor形成最终结论
- **AND** MUST不额外运行第二个最终Doctor、不创建新orchestrator或持久化新的workflow state

#### Scenario: Formal Finish已经complete
- **WHEN** 首轮指定Agent Doctor、cleanup与Formal Finish已经成功且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在post-Finish动作和显式开发入口identity验证后，通过该retained Project bridge显式运行一次最终指定Agent Doctor
- **AND** 任一动作即使被多条路径命中也 MUST至多执行一次

### Requirement: 产品验证必须覆盖 Buildr Web Environment authority 与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、CLI/依赖准备、runtime projection、Task-scoped Change 解析、Buildr Web Environment inspect、资源登记、串行恢复、Finish cleanup handoff与明确放弃，并 MUST 证明所有正式 consumer 只读写 Workspace SQLite Environment current authority。Environment readiness MUST不包含全局Workspace Node probe。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、SQLite current row、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和Project显式executable等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净task checkout没有`node_modules`且候选CLI probe失败
- **THEN** retained stable controller MUST使用Product声明的精确development Node与checkout自己的npm/lockfile完成`npm ci`后重新probe
- **AND** verifier MUST证明retained/peer `node_modules`未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** current row、其他 previews、默认 Buildr Web 与其他任务 MUST 保持不受影响

#### Scenario: Task-scoped Change 与 Buildr Web Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt store 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止文件 authority 回退
- **WHEN** package/static/runtime verification 发现旧 environment writer、文件 importer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在 OpenSpec archive/history，Buildr runtime、sync 与 package tests MUST NOT保留迁移 reader

### Requirement: 产品验证必须覆盖 Task Manager package、CLI 与 Buildr Web parity
Buildr package verification MUST 在 checkout、初始化 Workspace、同步 Workspace、隔离 runtime、Buildr Web browser 与 npm tarball 场景覆盖 contract/Skill、todo/active 状态、来源关系、CLI registry/help、Buildr Web route/API/assets、public JSON、filesystem effect 和失败分支，并 MUST 在任一入口行为漂移时失败。

#### Scenario: checkout 与 tarball 成功路径
- **WHEN** verifier 分别使用 checkout CLI 与 npm tarball CLI 对等执行 create/inspect/update/activate/complete/abandon 及来源关系 mutation
- **THEN** 两者 MUST 使用相同 command help、record/result schema 与状态语义
- **AND** todo 创建 MUST 证明除 SQLite owner rows 外无 filesystem 或专业副作用

#### Scenario: checkout 与 tarball 失败路径
- **WHEN** verifier 分别触发重复 ID、非法状态/来源、todo Change、终态改写与损坏 record
- **THEN** 两者 MUST 返回等价 stable code、blocked status、effects 与 nextActions
- **AND** 原 record 与 sibling owner records MUST 保持不变

#### Scenario: package source 与 runtime drift
- **WHEN** Skill source、contract、manifest description、binding、CLI schema registry 或 runtime 投射中的任一项缺失或过期
- **THEN** affected/package verification MUST 报告精确资产和 identity drift
- **AND** Buildr MUST NOT把结构 ready 冒充为行为已验证

#### Scenario: CLI 与 Buildr Web 行为漂移
- **WHEN** CLI 与 Buildr Web 对相同 open Task mutation 产生不同 record、validation code 或 state transition
- **THEN** affected/browser/package verification MUST 失败并指出发生漂移的 Application client
- **AND** 两个入口同时错误 MUST NOT掩盖 canonical contract 失败

### Requirement: 产品与自举验证必须覆盖零差异已包含恢复
Buildr package/runtime verification MUST覆盖显式零差异Delivery Adaptation、既有blocked run恢复、activation path保留、stable already-contained交付与target再次前进的fail-closed行为。Buildr Task Finish Skill MUST指导Agent只在完成语义审查后使用显式确认；self-bootstrap runner MUST优先使用additive activation paths并对旧Result回退`changedPaths`。

#### Scenario: 真实 Git remote 中恢复零差异 run
- **WHEN** fixture先让原Task Contribution进入target，再以重叠路径后续提交推进target，并把同一run保留为clean adaptation-required baseline carrier
- **THEN** Agent显式确认后的resume MUST观察到零carrier commit、零fast-forward、零push、零正式Verification执行与成功cleanup
- **AND** Result MUST包含agent-reviewed、zero-delta、already-contained、activation paths与remote readback evidence

#### Scenario: 自举按冻结贡献路径执行
- **WHEN** 零差异carrier的实际changed paths为空，但冻结Task Contribution命中package、CLI或Buildr Web Launcher分类
- **THEN** self-bootstrap plan MUST从activation paths得到完整去重动作
- **AND** MUST完成默认CLI identity与最终Doctor，不得把该任务错误归类为not-applicable

#### Scenario: 未确认或baseline漂移保持阻塞
- **WHEN** fixture省略显式确认、篡改carrier、改变Task source/handoff或在确认后再次推进target
- **THEN** verifier MUST观察到对应input/adaptation/target-race诊断与current token
- **AND** MUST NOT观察到自动Agent review、伪造diff、重复commit、force push或Task提前完成

### Requirement: self-bootstrap Development Launcher必须使用独立内部manager
Buildr自举Workspace的self-bootstrap activation MUST通过retained checkout的development-only Launcher manager安装或刷新`Buildr Web Dev`，并 MUST使用Environment交接且匹配Product精确development Node声明的executable执行该manager。它 MUST NOT调用npm-owned `web launcher`公共命令、传入已退役的公开channel参数、要求npm installation registration，或创建和覆盖npm-owned `Buildr Web` Launcher。Development Launcher MUST绑定固定默认端口`4458`。安装前存在经过secret health认证且属于development channel的健康默认实例时，activation MUST在安装后通过retained Project bridge以新Launcher identity恢复到`4458`并重新验证该实例；安装前没有该健康实例时 MUST保持按需启动。

#### Scenario: npm-only交付后激活Development Launcher
- **WHEN** frozen Task Contribution命中Development Launcher安装且公开`web launcher`已收敛为npm installation专用命令
- **THEN** self-bootstrap closeout MUST直接使用retained精确development Node执行successor checkout内的development-only manager
- **AND** manager结果 MUST证明channel为development、source checkout为retained successor、Node版本与executable匹配Product声明、commit为delivered successor且Launcher端口为`4458`

#### Scenario: 公开npm Launcher拒绝development channel
- **WHEN** 用户或旧consumer向公开`buildr web launcher`传入development channel
- **THEN** CLI MUST fail closed且不得安装、改绑或登记任何Launcher

#### Scenario: Development Launcher manager失败
- **WHEN** development-only manager退出非零、返回无效结果或无法证明Launcher绑定retained checkout与精确development Node
- **THEN** self-bootstrap activation MUST停止在Development Launcher阶段并报告精确operation evidence
- **AND** MUST NOT继续最终Doctor或same-run Finish resume

#### Scenario: 安装前健康Development实例同端口恢复
- **WHEN** Launcher安装前的默认实例通过instance secret health认证、属于development channel且其loopback端口可证明
- **THEN** self-bootstrap activation MUST在Launcher更新后通过retained `projects/product/buildr`以精确development Node、新Launcher identity与端口`4458`启动服务
- **AND** 恢复evidence MUST记录原端口与新端口，并证明新实例健康、当前端口为`4458`、source checkout与commit为retained successor且新PID不同于已停止实例

#### Scenario: 历史随机端口实例迁移
- **WHEN** 安装前健康Development实例使用历史随机端口且`4458`可绑定
- **THEN** self-bootstrap activation MUST通过认证handoff停止旧实例并在`4458`恢复
- **AND** MUST NOT继续保留随机入口、同时启动第二实例或从端口猜测owner

#### Scenario: 安装前没有健康Development实例
- **WHEN** Development Root中的默认实例未运行、记录陈旧或健康实例属于其他channel
- **THEN** self-bootstrap activation MUST只完成适用的Launcher安装且不得自动启动Buildr Web Dev
- **AND** Result MUST明确记录continuity为not-applicable及观测原因

#### Scenario: Development实例恢复失败
- **WHEN** 固定端口被占用、启动超时、health认证失败、恢复后的Launcher/source/Node/commit identity不匹配或启动进程提前退出
- **THEN** self-bootstrap activation MUST回收本次启动且ownership可证明的异常子进程并形成Activation Attention
- **AND** MUST保留已成功交付的代码与已更新Launcher、报告恢复operation evidence、不得停止foreign占用者或回滚Delivery，并且不得继续development entry验证、最终Doctor或same-run Finish resume

### Requirement: Task Entry Snapshot 必须作为完整 package surface 交付
Buildr package MUST包含Task Entry Snapshot Application、CLI route、public JSON identity、action-local Skill guidance、reference/current knowledge与focused tests。checkout源码入口、npm package与managed runtime projection MUST对该surface保持一致。

#### Scenario: package/static parity
- **WHEN** 产品构建或检查package assets
- **THEN** 新Application、CLI、schema与guidance MUST均被正式package包含
- **AND** 缺少任一运行时模块、registry identity或受管Skill更新 MUST使验证失败

#### Scenario: 既有行为兼容
- **WHEN** package加入Task Entry Snapshot
- **THEN** 既有Task inspect、Environment、Development、retry/resume/cancel、Verification Result、Execution Record与Finish命令 MUST保持原schema和行为
- **AND** 不得要求持久化migration或回填历史Task

### Requirement: Required Core 明确文本文件 EOF 不变量
Buildr package assets MUST 在 required Core 中要求所有新建或重写的文本文件于最后一个非空字符后必须且只能保留一个换行符，并 MUST 明确文件末尾不得存在空白行。Core MUST 用 `...\n` 表示正确结果、用 `...\n\n` 表示错误结果，并 MUST 说明该限制只针对文件末尾，不限制正文内部的合理空行。

#### Scenario: Package 校验 Core EOF 正反例
- **WHEN** Buildr packages or validates `rules/buildr/core.md`
- **THEN** required Core MUST 同时包含 `...\n` 正例与 `...\n\n` 反例
- **AND** Core MUST 把约束限定到文件末尾并保留正文内部合理空行

#### Scenario: Agent 新建或重写文本文件
- **WHEN** Agent 在任意 Buildr Task 中新建或重写文本文件
- **THEN** Agent MUST 直接生成恰好一个结尾换行符且没有末尾空白行的结果
- **AND** Agent MUST NOT 将该规则解释为禁止正文内部的合理空行

### Requirement: Package 必须验证正式工作流内部路由闭环
Buildr package MUST维护Task Development、Task Retrospective与Task Planning Identity的单一required internal workflow route inventory，并 MUST让CLI分派、受管consumer、package static validation、Doctor与npm installed-layout tests消费一致route identity。每个route MUST在实际npm artifact中可启动；Retrospective writer与Planning Identity reader MUST在安装布局fixture中完成真实Application调用。

#### Scenario: npm artifact 内部路由完整
- **WHEN** 产品验证安装本次生成的npm tarball并执行required internal workflow route tests
- **THEN** 三个`__internal` route MUST由安装产物自身成功启动且返回各自closed contract
- **AND** test MUST NOT借用development checkout的source driver、node_modules或payload identity完成执行

#### Scenario: Doctor 发现 route closure 漂移
- **WHEN** 当前runtime缺少required route、受管consumer引用未知route或route未绑定对应runner
- **THEN** Doctor MUST返回稳定actionable finding并保持只读
- **AND** MUST NOT通过下载source checkout、改写Skill或伪造route availability来自愈

### Requirement: Parent Plan v2 必须在产品包中一致交付
Buildr package MUST 原子交付 Parent Plan v2 Domain/Application/CLI JSON contract、Task workflow guidance、Buildr Web 正式构建产物与对应验证。Package/current workspace/candidate 三种入口的 schema、状态语义或 Web assets 不一致时 package check 或适用验证 MUST fail closed。

#### Scenario: package asset 一致性
- **WHEN** 维护者构建包含 Parent Plan v2 的候选包
- **THEN** package 中的 CLI schema/example、workflow 指引与 `web-dist` MUST 对 expected/actual binding 使用同一语义
- **AND** package verification MUST 检测遗漏或旧 v1 writer 指引

### Requirement: Parent Coordination v3 必须原子进入全部交付入口
Buildr package MUST原子交付v3 Application、CLI、HTTP、Agent Skills、Buildr Web正式构建产物、JSON文档与验证，MUST在development checkout、npm tarball或`web-dist`任一仍引用v2时失败。

#### Scenario: 构建产品候选
- **WHEN** 维护者验证包含Parent Coordination v3的候选
- **THEN** package parity MUST证明checkout与npm CLI使用相同v3 identity和字段
- **AND** web-dist MUST来自已切换v3类型与consumer的Buildr Web源码

### Requirement: 随包 workspace AGENTS 提供默认提交语言
Buildr package MUST 通过随包 workspace `AGENTS.md` 提供默认 commit-message 语言约定，而不是把该默认值归属于 required Core。

#### Scenario: 初始化或同步默认 workspace
- **WHEN** Buildr initializes or synchronizes a workspace from the default package
- **THEN** the rendered workspace `AGENTS.md` MUST state that commit-message subject and body use Chinese when no more specific convention applies
- **AND** the rule MUST allow code identifiers、paths、scope and proper nouns to retain their original form

#### Scenario: 更具体约定覆盖默认语言
- **WHEN** Project、Service or repository rules define a more specific commit language
- **THEN** Agent MUST use the more specific convention instead of the workspace default

#### Scenario: Git Operations 生命周期变化
- **WHEN** Git Operations is absent、replaced or unavailable
- **THEN** the workspace commit-language default MUST remain available through `AGENTS.md`
- **AND** the default MUST NOT depend on the Git Operations Skill lifecycle

### Requirement: resources manifest 声明文件型交付资源
Buildr MUST 使用 `resources/manifest.yml` 声明 Workspace baseline、Builtin 内容、文件型交付资源和 source-to-target 映射；用户 Workspace 持久化配置与 registry MUST 由对应 Domain writer 生成，不得作为资源物理源。

#### Scenario: 维护默认 Workspace baseline
- **WHEN** Buildr 维护或发布默认 Workspace 内容
- **THEN** 内容源 MUST 位于 `resources/workspace/` 并由 `resources/manifest.yml` 显式引用
- **AND** 用户态 manifest、Project/Service registry 与其他 writer-owned 状态 MUST NOT 进入资源树或发布 inventory

#### Scenario: package check 校验资源 manifest
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 校验 manifest include、source-to-target 映射、模板变量、禁止内容和源路径存在性
- **AND** MUST NOT 从旧 `package/manifest.yml` 或 `package/targets/workspace/` 回退

### Requirement: 初始化必须从 resources manifest 映射生成
Buildr MUST 从 `resources/manifest.yml` 的产品声明和内容映射生成默认 root/Project 内容，并 MUST 通过 canonical Domain writer 生成 Workspace、Project 与 Service 的持久化配置。

#### Scenario: 渲染 root baseline
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 使用 resources manifest 的 Workspace mappings 生成 Rule、Skill、Command、Component、AGENTS 与 Git 模板等内容资产
- **AND** Buildr MUST 通过 canonical writer 生成全部持久化配置
- **AND** Buildr MUST NOT 读取旧 package Workspace target
