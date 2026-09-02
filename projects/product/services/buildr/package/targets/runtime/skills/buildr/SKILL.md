---
name: buildr
description: 在 Buildr workspace 中安装、更新或同步 Buildr、更新或同步 workspace、诊断和维护组织工作资产，用户要求采用内部流程、调整工作方式、修改或替换 Skill 行为，或要求复盘任务、总结可沉淀的 Skill/Rule 时使用；覆盖 Buildr CLI 与产品入口 Skill、组织（Organization/Root）、项目（Project）、服务（Service）、组件（Components）、规则（Rules）、技能（Skills）、命令（Commands）、内置能力（Builtins）、工作能力适配和 Agent runtime 渲染。
---
# Buildr Skill

## Buildr 是什么

Buildr 是为组织和 Agent 构建的工作资产治理系统。它把散落在员工个人经验、文档、仓库和工具中的工作事实与工作方法，沉淀为可共享、可审计、可适配不同 Agent 的工作区（workspace）源资产。工作事实回答“干的是什么”，工作方法回答“怎么干”；Rules、Skills、Commands、Projects、Services 和专业能力等是当前示例，不是工作资产概念的封闭边界。Agent 是这些资产的主要使用者；人通过 Agent 表达目标、提供业务判断并确认重要决策。

Buildr workspace 是组织（Organization/Root）资产根；Agent runtime 是面向当前 Agent 的可重建入口。Buildr 不成为另一个 Agent，也不接管 Agent 的理解、推理和任务执行。Buildr 组织并投射 Agent 可发现、可选择、可使用的工作资产，不替 Agent 构造 context window；Agent 根据当前任务发现并选择相关内容，形成任务上下文并推进工作。Workspace 不保存本机版本偏好；用户级 Buildr Data Root 只保存避免重复版本提醒所需的最小状态。

Agent 使用本 Skill 判断用户意图属于哪类 Buildr 资产，并通过 Buildr CLI 完成维护、诊断和按需渲染。事实状态以 `buildr runtime list --json`、`buildr doctor --agent <agent> --target <dir> --json`、manifest、CLI 帮助和 CLI 错误输出为准。组织资产先改变源资产（使用 Buildr CLI），再同步 Agent runtime（使用 render/sync）。
Agent 是 Buildr 功能的默认操作入口。Agent 能在当前工具、权限和安全边界内完成的动作，应先说明必要影响并取得所需授权，再直接执行和验证；不得默认把命令交给用户代为执行。用户明确选择手动方式，或 Agent 因工具不可用、权限、登录态、外部环境等原因无法完成时，再提供准确的手动操作兜底。

用户要求“安装 Buildr”且未限制范围时，只从 npm Registry 安装 `@buildr-ai/buildr`，并验证 CLI 与 `buildr web`。普通安装默认不修改 Applications 或 Start Menu；只有用户明确需要图形入口时才执行 `buildr web launcher install`，并验证它绑定同一 npm installation、Host Node 与 package entry。全局安装不猜测 Workspace 或写 Agent runtime；`init --agent` 在目标 Workspace 首次投射 Buildr Skill，之后由 `sync`/`render` 收敛。Buildr 产品 checkout 使用 `npm run install:development` 同时更新当前 checkout CLI 与隔离的 `Buildr Web Dev`；development Launcher 不覆盖正式 npm Launcher。在 Buildr Product checkout 中执行 Workspace CLI / HTTP smoke 时，必须经过 `tools/development/run-isolated-workspace-smoke.mjs`；标准代表性流程从 `projects/product/services/buildr` 运行 `npm run smoke:workspace`，其他已登记场景使用 runner 的 `--script` 入口。runner 独立设置 Workspace、`BUILDR_APP_DATA_DIR` 与 `BUILDR_PRODUCT_DATA_DIR`，并在成功或失败后统一清理。不得用裸 `mktemp` 启动指向默认用户 profile 的 `buildr web`，也不得把 smoke Workspace 登记写入发布版或开发版真实用户状态。此约束只保护 Buildr 自身开发 smoke，不扩大为对普通临时 Workspace 的自动删除策略。
## 执行循环

1. 确认 `target`。未指定时默认当前目录；如果当前目录在服务（Service）代码仓内，先定位 Buildr 组织（Organization/Root）。
2. `<agent>` 只取当前宿主明确身份；用户明确指定其他 runtime 时才改用该目标。用 `buildr runtime list --json` 确认支持映射；不得从 Skill 路径、generated marker、投射回执或 Doctor 的 `requested`、`selected`、`detectedAgents` 推断宿主。
3. 宿主身份无法和支持列表对齐时，停止需要 `<agent>` 的 Buildr 操作并请求确认；不得借用其他 adapter 作为 fallback。
4. 判断 workspace 是否已初始化。未初始化时运行 `buildr init --agent <agent> --target <dir> --name <name> --profile <personal|team|company>`，并使用命令内置的最终 doctor 结果；已有 workspace 运行 `buildr doctor --agent <agent> --target <dir> --json` 建立事实基线。不要省略 `--agent`。
5. 根据用户目标和 doctor 结果选择资产类型：组织（Organization/Root）、项目（Project）、服务（Service）、组件（Components）、规则（Rules）、命令（Commands）、技能（Skills）、内置能力（Builtins）、工作能力适配或 Agent runtime 渲染。用户要求采用内部流程、调整工作方式、修改或替换 Skill 行为时，不要求用户指出 Skill/capability；先加载 `capability-adaptation` 判断是否触达或产生跨 Skill 稳定依赖边界。
6. 执行对应维护动作。用户要求完整检查 Buildr 或检查安装状态时，以及用户要求“更新 Buildr”或“同步 Buildr”时，先运行 `buildr update check --json`，分别说明 `stable` 对应的 GA 正式版和 `candidate` 对应的 RC 候选版。存在可用更新时，询问用户选择 GA、RC 或暂不更新；只有用户明确选择后才运行对应 `buildr update --track stable|candidate`，不得自动切轨或降级。更新成功后重新解析当前 `buildr` 入口；若原意图是“更新 Buildr”或“同步 Buildr”，再运行 `buildr skill install <agent> --target <dir>`，不因此同步整个 workspace。用户明确要求“只更新 CLI”时只执行所选轨道更新，不追加 Skill install。用户要求“更新 workspace”或“同步 workspace”时，先判断 workspace root 是否由 Git 管理：如果是，解析 `buildr.git-operations/v1` 并读取 selected provider，向它提供明确 workspace、upstream 和 update operation；安全更新本地 checkout 后直接运行 `buildr sync <agent> --target <dir>`；如果不是 Git workspace，直接运行 sync。该意图不先更新 CLI。required capability blocked 时停止并报告 reason/nextActions，不回退到已删除 builtin 或手写 Git route。update 受阻时不得继续用旧 CLI 安装 Buildr Skill。
7. 状态变更后确认最新 doctor 结果；`init --agent`、`sync` 和 Component install/uninstall 已包含最终 doctor，其他变更再运行 `buildr doctor --agent <agent> --target <dir> --json`。只有 doctor 指向专项问题，或用户明确要求细查时，才运行 `commands check` 或 `runtime check`。
8. 优先使用 Buildr CLI；复杂参数以当前 manifest、CLI 帮助和 CLI 错误输出为准。
## 任务路由
Agent runtime 先根据 Skill description 和用户目标发现入口 Skill。本 Skill 只有在 Buildr 管理意图与自身 description 匹配后才会被加载；它不是所有用户意图之前的全局 dispatcher，也不拦截 prompt。“收尾”等专业意图通常由 Agent 直接命中对应入口 Skill，再由该 Skill 读取自身的受管 capability bindings。

本 Skill 已加载后，只对下面明确列出的 Buildr 管理意图按需解析对应 capability。需要可替换 provider 时，在已初始化 workspace 运行当前 Agent Doctor 的 full detail，读取当前 scope 的 `capabilities` graph，再定位该项 contract 和 selected provider；不要把整张 consumer graph 当成本 Skill 的依赖表。`ready` 只表示结构可路由。调用 provider 前读取 contract 和 provider；不得根据 Skill id、description 或安装顺序猜测 conformance，也不需要 capability dispatch 命令。

| 用户意图 | 资产类型 |
|---|---|
| 安装 Buildr | 只从 npm Registry 安装 npm package；仅在用户明确需要时显式安装本机图形 Launcher；尚无目标 Workspace 时不安装 Buildr Skill |
| 初始化、修复或诊断 Buildr workspace | 组织（Organization/Root） |
| 检查、更新或同步 Buildr | 先读取 GA/RC 双轨道结果并让用户选择；明确更新后执行对应 CLI update + 产品入口 Buildr Skill install |
| 更新或同步 Git workspace | Buildr Skill 向 `buildr.git-operations/v1` selected provider 提供明确 workspace、upstream 和 update operation；更新后直接 sync |
| 恢复内置能力 | 内置能力（Builtins）/ Agent runtime 渲染 |
| 接入业务、产品线、系统或长期工作单元 | 项目（Project） |
| 接入代码仓、服务仓或可执行资产 | 服务（Service） |
| 查看待办/正式Task、Parent/Child、复盘文档状态与各专业当前状态 | `buildr.task-record/v3`及Review、Verification公开read model；复盘正文从`.buildr/local/task-retrospectives/<task-id>.md`读取 |
| 启动或继续已有active Formal Task | `buildr task inspect <task-id> --json`核对目标与scope；Agent再按真实Git/文件现场选择直接工作或matching Worktree |
| 查看 Parent/Child 关系、旧 Parent Plan 与整体完成观察 | `task parent inspect`；关系和终态由 Task Record 管理，旧 Parent Plan 只读 |
| 按需生成或查看已结束Task的执行效率复盘 | `task-retrospective`纯Skill基于当前可见事实写本机Markdown；Task Record v3只登记文档摘要和人的决定状态 |
| 设计或优化 Project / Service 测试框架、划分测试边界、编排场景，或为实现任务开发测试 | `project-testing` Skill；无 Result、Receipt 或 provider contract |
| 探查或维护Project测试地图、开发中选择已有前后端测试，或开发完成后记录和查看Task验证报告 | `buildr.task-verification/v4` selected provider；Agent直接调用项目测试工具 |
| 显式创建、检查或清理 Task 的 Git worktree/provider evidence | `buildr.git-worktree-provider/v1` selected provider |
| 从 proposal、方案或直接实现开始完成开发工作 | Agent 直接读取目标、OpenSpec、Git、代码、文件和专业结果，并按适用 Skill 使用现有工具；不创建研发回执 |
| 用户要求“收尾”“交付”或完成当前工作 | `task-finish` 技能依据真实现场组合 Git、系统工具和已有 Buildr 接口；有任务则登记真实结果，无任务不创建，不要求旧候选或交接链 |
| 已明确 repository/ref 的 commit、push、commit+push 或其他已选 Git Operation | `buildr.git-operations/v1` selected provider；本 Skill 或直接用户继续决定 operation、目标与顺序 |
| 统一安装、更新和卸载一组 workspace Rules、Skills、Command collections | 组件（Components） |
| 沉淀每次会话必须遵守的约束 | 规则（Rules） |
| 沉淀可复用任务流程或操作能力 | 技能（Skills） |
| 声明组织复用的外部命令行工具 | 命令（Commands） |
| 当前 Agent 找不到已声明规则或技能 | Agent runtime 渲染 |
| 为 Buildr 增加新的 Agent runtime adapter | runtime trait intake + OpenSpec change |
| 采用内部流程、调整工作方式、修改或替换 Skill 行为 | `capability-adaptation` Skill；先识别跨 Skill 稳定依赖边界，再开发、验证和激活 |
产品入口 Buildr Skill 只对自身已命中的 Buildr 管理意图执行内部能力路由，不是同时 required 依赖全部 capabilities 的 workspace consumer。顶层 capability 的 binding 只选择 provider，不自动产生 Agent 意图命中；只有某类 Buildr 管理意图命中后，才把对应 capability 作为本次动作依赖，单项 capability blocked 不得阻塞 init、doctor、Project/Service 或其他无关动作。Formal Task不是编辑、构建或有界测试的通用工作许可：用户授权、repository/ref、owned scope与副作用明确时，Agent直接工作；需要隔离Git位置时显式使用`worktree create|inspect`并在返回的真实checkout继续。Project依赖、代码生成和运行入口由Project/Service wrapper、包管理器与构建工具负责。任一provider返回`treeChanged: true`后，按本Skill的workspace transition约束运行当前Agent Doctor。doctor指出workspace sync是适用修复时，询问用户是否由 Agent 立即同步，同时提供准确手动命令作为备选；确认后执行一次sync并验证，当前 session 是否重新发现新资产由 Agent runtime 决定。“更新 workspace”或“同步 workspace”已包含sync授权，不重复询问 sync；遇到本地改动、分叉、冲突、缺少upstream或其他需要用户决策的状态时停止，不自动 stash、reset、rebase、merge、覆盖，也不继续 sync。
完整收尾意图由 `task-finish` 提供方法和边界。本入口不复制流程；应用只保障具体动作的身份、版本和副作用安全。
## 资产维护

### Workspace / Organization Root

- Workspace 是 Buildr 组织（Organization/Root）源资产根；`--target` 始终指向 Buildr workspace root，不指向 Service 代码仓。
- workspace 必须完成 `buildr init`；首次使用且当前 Agent 已确认时，运行 `buildr init --agent <agent> --target <dir> --name <name> --profile <personal|team|company>` 一次完成源资产、runtime 和最终 doctor。不带 `--agent` 的 init 只初始化源资产。`init --agent` 最终 doctor 通过后继续首次使用交接，而不是默认让用户执行 `project create`：用普通语言说明 Workspace → Project → Service；没有 Project 时询问要管理的业务、产品、系统、长期工作或已有 repo；唯一 Project 没有 Service 时说明 Service 只在代码仓、应用、模块或可执行资产存在时需要，并询问接入还是直接开始；唯一范围时直接邀请第一项工作目标；多个候选时只问消除范围歧义的最少问题。不要创建 `WELCOME.md`、持久 checklist 或固定教学 Rule。用户已经给出明确目标时连续推进，不为展示教学中断工作。
- 根 `AGENTS.md` 是规则入口，其受管区块（Managed Block）内联核心规则；专业规则通过 `rules/manifest.yml` 按需发现，`projects/manifest.yml` 是项目清单（Project Registry）。

### Project

- 创建或修复 Project/Service 必须来自用户意图、已有源资产、明确 repo/ref，或 doctor 指出的可修复 drift。Project 表示业务、产品线、系统或长期工作单元；canonical entity 使用 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`，`source.path` 定位文件系统位置。创建入口是 `buildr project create <code> --name <name> --description <description> --target <dir>`；独立 Git Project 再用 `--repo <url> --remote <name> --integration-branch <branch>` 声明来源，integration branch 是稳定集成目标而非当前 checkout。
- `currentBranch`、HEAD、dirty、upstream、ahead/behind 和实际 remote URL 由 doctor/app 实时观察，不写入 Domain；分支偏移可能是合法任务状态，任何 checkout、stash、merge 或 remote 修改前都核对任务、clean 状态、ownership 和授权，不盲目纠正。
- `projects/manifest.yml` v1 只兼容读取；使用 canonical `buildr sync <agent>` 迁移，不手工编造 UUID 或由页面静默迁移。`buildr web` 可查看 Project/Git 状态并受控修改 `name`、`description`；新增页面只生成 Agent prompt，不直接创建或 clone。
- Project可以按需维护可选`verification.yml`，只接受closed`buildr.project-verification/v4`测试地图，声明少量稳定测试体系的Project/Service scope、purpose、sourcePaths、testRoots、完整入口、选择指导与环境要求；不复制具体测试清单、Task计划或运行结果。Agent直接调用项目工具执行测试，开发完成后只通过Task Verification Application保存有意义报告。Project也可按需维护可选`preparation.yml`，声明Project-wide或Service-scoped真实准备入口；Agent只在当前动作需要时读取并直接调用，不保存Task Plan或执行状态。初始化、刷新、Project/Service注册、首次Task或专业gap先路由`declaration-intake`做只读发现；长期写入必须由用户确认后交给各声明owner。

### 遗留 Practices

- Practices 不再是独立 Buildr 资产类型；已有 workspace 或 Project `practices/` 是用户保留数据，不得自动读取、迁移、覆盖或删除，也不得因其存在阻塞正常命令。
- 用户决定整理时，先人工审阅内容语义：约束和值守边界迁移为 Rule，可复用专业动作和操作流程迁移为 Skill，产品事实、需求和变更迁移为 OpenSpec，其他说明保留为普通 docs。
- 不根据文件名或正文猜测迁移类别；用户确认内容已经妥善归类且目录为空后，才由用户自行决定是否删除遗留目录。

### Service

- Service 表示代码 repo 或可执行资产；用户提供 service repo 路径、Git URL 或明确要接入服务资产时才创建。
- canonical Service entity 使用 UUID `id`、`workspaceId`、直接父实体 `projectId`、Project 内唯一 `code`、`name`、`description`、开放词表 `type` 与 `source`；`source.path` 是 Workspace 相对完整路径，Git source 只声明 URL、remote 与稳定 `integrationBranch`。接入命令是 `buildr service create <project>/<service> <repo-ref> --target <dir> --name <name> --description <description> --type <type> [--remote <name>] [--integration-branch <branch>]`，`--branch` 只作为兼容别名。
- Service registry 写入所属 Project 的 `services/manifest.yml`；v1 只兼容读取，修改前让 Agent 通过 canonical sync 显式迁移 v2。Service 规则入口是 Service 目录中的 `AGENTS.md`，不写入 `rules.source`。`currentBranch`、HEAD、dirty、upstream、ahead/behind 是实时观察态；偏离 `integrationBranch` 时结合当前任务判断，不自动 checkout、stash、merge 或 rebase。
- Rules scope 使用真实 workspace 相对路径：`.`、`projects/<project>`、`projects/<project>/services/<service>` 或其任意深层目录。

### Builtins

- 核心规则位于根 `AGENTS.md` 受管区块，不是独立内置项；专业规则（Rule）、技能（Skill）和命令（Command）仍由各自清单管理。
- 只更新 Buildr CLI 自身：先用 `buildr update check --json` 同时读取 GA 正式版与 RC 候选版，用户明确选择后运行 `buildr update --track stable|candidate`。不自动切轨、不自动降级；命令不读取 workspace。
- 安装或修复当前 CLI 携带的产品入口 Buildr Skill：`buildr skill install <agent> --target <dir>`；“更新 Buildr”或“同步 Buildr”默认在 update 后使用此入口，不扩大为 workspace sync。
- 同步 workspace 产品源能力并准备当前 Agent runtime：`buildr sync <agent> --target <dir>`。
- 查看 workspace 内置能力状态：`buildr builtin list --target <dir> --json` 或最终 doctor。
- 卸载 optional 内置能力：`buildr builtin uninstall <id> --target <dir>`；required 能力不能卸载。
- 恢复 optional 内置能力：`buildr builtin restore <id> --target <dir>`。该命令表示用户已确认放弃此 Builtin 的本地修改；若当前 Builtin 声明 predecessor，只能接管 manifest 可证明为 Buildr-managed 且路径匹配 package 声明的旧 identity，ownership 不明或目标冲突时仍须停止。replacement source 恢复后继续运行 `buildr sync <agent> --target <dir>` 收敛当前 Agent runtime，不要求用户手工移动 Skill 目录。

### Components
- Component 是 workspace 级统一生命周期单元；当前不支持 Project/Service Component。registry 为 `components/manifest.yml`，成员由 installed `component.yml` 唯一声明。
- Component 必须自证 definition、全部成员 integrity、唯一 ownership 和 Skill Contribution 完整性；不能注册或注入 runtime adapter、runtime hook、可执行 member 或 registry patch。验证通过的 Contribution 只作为通用 runtime source input。
- Sidebar 是对外部能力的独立、可卸载增强；Skill Contribution 是其 runtime 组合机制。外部 Skill 源必须保持上游正文，Buildr 增强只进入 Agent runtime 派生版本，不在 `skills/buildr/` 维护外部 fork。
- 用户明确说“作为 Component”时，即使只有一个成员也走 Component；用户明确要单项 Rule、Skill 或 Command 时走单项入口。
- 用户只说“安装 X”时，先读取权威来源并识别会安装的资源；跨资产类型或需要统一版本、更新、卸载时创建或选择 Component，组成不明时继续调查，不让 CLI 猜测。
- 安装前用 `buildr component list/check --target <dir> --json` 核对来源、版本、成员和 integrity；执行 `buildr component install <id> --agent <agent> --target <dir>`。
- 用户只说“卸载 X”时，先查询 registry、ownership 和 `component check`。若 X 是 Component 或其成员，不得调用单项删除命令。
- 卸载前展示 Component id、source、version、workspace scope、将删除的 Rules、Skills、Command collections 和当前 Agent runtime 投射，并说明不会删除本机外部 CLI 或任何 Project 内容；然后请求用户针对完整范围二次确认。
- 只有用户明确确认后才运行 `buildr component uninstall <id> --agent <agent> --target <dir> [--reason <text>]`；拒绝、未确认或范围变化时不得写入。
- install/uninstall 必须完成指定 Agent runtime reconcile 和最终 doctor；仍有 error 时不得报告完成。
- sync 完成后，应提醒用户 optional Rules、Skills、Components 和 Command declarations 可以按需卸载；用户不希望使用某项能力时，由 Agent 先检查完整影响范围再使用对应生命周期入口。

### Rules

- Rules 源资产是当前 scope 的 `AGENTS.md`、`rules/manifest.yml` 和 `rules/`。
- Rules 控制 Agent 的价值观、边界和约束；Skills 封装可复用的专业动作和操作流程。
- Rule 和 Skill 不以“是否必须加载”作为本质区分；Rule description 是 Agent 判断规则语义相关性的索引，不是路径或角色路由表。
- Agent runtime adapter 按“scope 祖先链 + scope 子树”发现和投射 `AGENTS.md`，不替 Agent 判断 optional Rule 与任务的语义相关性，也不使用预设 role/path 路由。
- `enabled: true`、`required: true` 且 `state: installed` 的 Rule 必须读取；`enabled: true`、`required: false` 且 installed 的 Rule 先检查 description，语义相关时在行动前读取正文。
- `enabled: false` 或 `state: uninstalled` 的 Rule 不参与当前任务。
- root/Organization 规则新增：先创建并编辑 `rules/<rule-id>.md`，再运行 `buildr rules add <rule-id> --target <dir> --description <text>`；未传 `--path` 时默认注册 `rules/<rule-id>.md`。
- root/Organization 规则删除：运行 `buildr rules remove <rule-id> --target <dir>`，同时删除 manifest entry 和规则文件；如只取消注册并保留文件，使用 `--keep-file`。
- Project/Service 规则分别通过对应目录的 `AGENTS.md` 维护，不使用 Project 或 Service 级 `rules/manifest.yml`。
- 需要渲染到 Agent runtime 时，运行 `buildr rules render <agent> --scope <workspace-relative-path> --target <dir>`；Codex 原生读取，Claude Code 使用逐 source bridge，Cursor/Qoder/TRAE 使用 scoped vendor rules，TRAE Work/WorkBuddy 使用 root reference bridge。具体路径、reload/UI 前置条件以及 `documented` / `verified` 证据等级见随包 `docs/agent-runtime-adapters.md`；GUI smoke 保持一次性人工 Prompt，不自动点击或抓取应用私有状态。
### Commands

- Commands 分为三层：workspace `commands/manifest.yml` 与 `commands/**/manifest.yml` 是唯一 catalog definition source，Project `commands.yml` 只保存 requirement references，实际 binary/version/login 属于 user/machine environment。
- 新增或替换 catalog definition 用 `buildr commands add`，删除用 `buildr commands remove`；`--collection <path>` 选择嵌套 collection。Component-owned collection 只能通过 Component 生命周期维护，删除最后一个仍被 Project 引用的 definition 会整次零写入。
- 用户说明某个 Project 需要工具时，只在 `projects/<project>/commands.yml` 维护 `id`、`required`、可选 `version` 和 `purpose`；不得复制 executable、version probe 或 install hint。
- doctor 已聚合 Commands 分层检查；单 Project 使用 `buildr commands check --project <project> --target <dir> --json`，跨 Project 重复传入 `--project`，无 Project context 只检查 workspace defaults。
- Commands 只声明和检查，不渲染到 Agent runtime、不安装 binary，也不保存 token、cookie、登录态、license 或个人配置。
- machine observation 不满足 requirement 时，按 catalog `installHint` 或官方链接说明差异；安装、升级和登录配置必须取得用户授权。

### Skills

- Workspace 是唯一 Skill source authority：源资产位于 workspace `skills/manifest.yml` 与 `skills/<skill-id>/`。Project 只在 `capabilities.yml` 引用 workspace Skill 并声明 requirements/bindings/applicability，不作为安装或可见性边界。
- 本地作者型 Skill 可以只适用于某个 Project，但内容仍在 workspace 维护，由 Project applicability 表达业务范围；远端发布型 Skill 适合已发布或外部维护的 Skill。
- Buildr 随包场景化流程通过 workspace Skills 承载；Rule 保留 Agent 价值观、边界和约束。
- 本地作者型：`buildr skills add [<id>] --source <skill-dir> --target <workspace>`；删除用 `buildr skills remove <id> --target <workspace>`。旧 `--scope .` 只作 deprecated 兼容；Project scope 已不受支持。
- 本地作者型和 package Skill 的完整源目录可包含 `SKILL.md` 以及 `agents/`、`assets/`、`examples/`、`references/`、`scripts/`、`templates/`；render 保留随附文件的原始字节与 owner executable 状态，只有 `SKILL.md` 会注入 managed marker、contributions、capability bindings 和 adapter context。
- 通用 Skill 合法性和 Codex 发布都只要求有效 `SKILL.md`，`name` 与 `description` 承担发现和路由。adapter-specific optional extensions 由目标 runtime descriptor 独立校验：Codex/OpenAI 只校验已经存在的 `agents/openai.yaml`，缺失不阻塞、不生成也不反写；其他 adapter 可保留但不消费已有 vendor metadata。Skill 正文使用模板或脚本时，从当前 runtime `SKILL.md` 所在目录解析相对路径，核心行为不得依赖 vendor metadata。
- Provider/consumer 声明使用可重复的 `--provides <capability>@<version>` 和 `--requires <capability>@<version>:<required|optional>`；显式选择用 `buildr skills bind <capability>@<version> --provider <skill-id> --scope <scope> --target <dir>`，取消选择用 `skills unbind`。
- 远端发布型：先用 `buildr skills add <id> --remote-source <url> --target <workspace>` 登记；解析出确定安装源后用 `--resolved-source <url> --replace` 更新。
- `--resolved-kind` 默认 `skill-url`，表示 URL 内容是 raw `SKILL.md`；`--version`、`--integrity` 和 `--ignore-unsupported` 等细节按 CLI 帮助和 manifest 补齐。
- 当前工作目录使用 Skill 时运行 `buildr skills render <agent> --destination workspace --target <workspace>`；用户明确要求所有 workspace 共享时才运行 `--destination user`。省略 destination 默认 workspace；`init`、`sync` 和组合 `render` 不隐式写用户层。`buildr skill install <agent>` 只安装或修复 Buildr 产品入口 Skill。
- render 在任何写入前检查 workspace/user roots、receipts 与完整目录 inventory；`equivalent_external`、`foreign_owner`、`name_conflict` 阻止整次 mutation。首版不自动 adopt/transfer，`--replace` 也不能取得外部 ownership。
- legacy `projects/<project>/skills/` 已不受支持，当前 Buildr 不提供自动迁移。升级前使用旧版本完成迁移，或人工审阅后把 source 整理到 workspace `skills/`；当前命令不得复制、合并、改写或删除这些 bytes。
- render 结果分三类：本地源由 Buildr 安装，已解析远端源由 Buildr 安装，未解析远端信息源由 Buildr 生成 Agent 可读安装说明并要求 Agent 处理。
- 完整目录投射由 adapter-specific receipt 记录受管文件 identity；源删除、卸载和重复 render 只清理仍匹配回执的文件。runtime 文件被修改或目录含未知用户文件时必须停写并保留现场。`resolved.kind: skill-url` 仍只表示单个 raw `SKILL.md`，不得推测 URL 邻近目录。

### Agent 运行时渲染

- 只在当前 Agent 已确认受支持时处理 Agent runtime。
- `buildr runtime list --json` 的静态 registry 是 supported adapter 的事实源，并输出 user/workspace destination roots、discovery inventory evidence、activation 和 checker traits。`partial` 表示无法枚举全部 admin/system/plugin Skills，只作为 runtime scope 的 assurance metadata 保留，不构成 doctor warning 或修复动作，也不能据此宣称全局无同名项。
- Adapter 只生成 runtime-specific 声明式计划；Buildr 通用 core 统一负责 Component 完整性后的 source assembly、计划验证、冲突预检、写入、清理和诊断。
- 用户要求增加新 adapter 时，先从目标 Agent 收集能直接映射到 trait descriptor 的最小 intake：identity/surface、Rules kind、Skills root、activation、安装/版本 checker 和最小黑盒证据；不要调查与 adapter 无关的产品功能。
- 新 adapter 属于 Buildr 产品 change-flow：每个 runtime 使用独立 descriptor、capability evidence 和 tests；只在现有 primitive 无法表达时增加新的静态 implementation，不能 alias 或 fallback 到其他 adapter。
- 用户说“更新 Buildr”或“同步 Buildr”时，先读取 `buildr update check --json`，说明 GA/RC 可用更新并等待用户选择；选择后运行对应 `buildr update --track stable|candidate`，再用新入口执行 `buildr skill install <agent> --target <dir>`。用户说“只更新 CLI”时不追加 Skill install。用户说“更新 workspace”或“同步 workspace”时，Git 管理的 workspace 由 Buildr Skill 向 Git Operations 提供明确 workspace、upstream 和 update operation，安全更新本地 checkout 后运行 `buildr sync <agent> --target <dir>`，非 Git workspace 直接 sync，且两者都不先更新 CLI。协作者提交使canonical checkout前进时，归类为普通Workspace update；本地没有协作者Task是正常事实，不得从commit author、Task缺失、HEAD、dirty tree或Doctor runtime drift反推本地交付流程。post-transition Doctor仅把actionable findings归因于当前Agent managed workspace/runtime projection stale时，执行一次`buildr sync <agent> --target <workspace-root>`并消费最终Doctor；Doctor包含CLI、Component、Command、Git或其他非sync blocker时，不能把一次sync宣称为完整修复。普通workspace sync不创建Task、Worktree、Verification或self-bootstrap evidence。
- doctor 指出特定 Rules scope runtime 问题时按 canonical workspace 相对 scope 运行 `render`、`rules render` 或 `runtime check`；Skills 始终从 workspace authority 处理 destination，不折叠为 legacy Project Skill source scope。
- `runtime check` 是专项 runtime 细查入口；只有 doctor 指向具体 runtime 问题，或用户明确要求细查时运行。

## 完成标准

- 用户目标已映射到对应 Buildr 资产类型。
- 状态变更后已运行 `buildr doctor --agent <agent> --target <dir> --json`，且没有需要用户立即处理的 error。
- 有复用价值的信息已按语义写回 Buildr 源资产：Rule、OpenSpec、Skill、Component、Command、Project/Service registry 或普通 docs。
- Agent runtime 已按需 sync 或 render。

如果本 Skill 不可用或 runtime 损坏，运行：

```bash
buildr bootstrap guide
```
