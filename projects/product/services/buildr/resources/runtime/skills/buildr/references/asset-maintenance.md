# 资产维护

## Workspace / Organization Root

- Workspace 是 Buildr 组织（Organization/Root）源资产根；`--target` 始终指向 Buildr workspace root，不指向 Service 代码仓。
- workspace 必须完成 `buildr init`；首次使用且当前 Agent 已确认时，运行 `buildr init --agent <agent> --target <dir> --name <name> --profile <personal|team|company>` 一次完成源资产、runtime 和最终 doctor。不带 `--agent` 的 init 只初始化源资产。`init --agent` 最终 doctor 通过后继续首次使用交接，而不是默认让用户执行 `project create`：用普通语言说明 Workspace → Project → Service；没有 Project 时询问要管理的业务、产品、系统、长期工作或已有 repo；唯一 Project 没有 Service 时说明 Service 只在代码仓、应用、模块或可执行资产存在时需要，并询问接入还是直接开始；唯一范围时直接邀请第一项工作目标；多个候选时只问消除范围歧义的最少问题。不要创建 `WELCOME.md`、持久 checklist 或固定教学 Rule。用户已经给出明确目标时连续推进，不为展示教学中断工作。
- 根 `AGENTS.md` 是规则入口，其受管区块（Managed Block）内联核心规则；专业规则通过 `rules/manifest.yml` 按需发现，`projects/manifest.yml` 是项目清单（Project Registry）。

## Project

- 创建或修复 Project/Service 必须来自用户意图、已有源资产、明确 repo/ref，或 doctor 指出的可修复 drift。Project 表示业务、产品线、系统或长期工作单元；canonical entity 使用 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`，`source.path` 定位文件系统位置。创建入口是 `buildr project create <code> --name <name> --description <description> --target <dir>`；独立 Git Project 再用 `--repo <url> --remote <name> --integration-branch <branch>` 声明来源，integration branch 是稳定集成目标而非当前 checkout。
- `currentBranch`、HEAD、dirty、upstream、ahead/behind 和实际 remote URL 由 doctor/app 实时观察，不写入 Domain；分支偏移可能是合法任务状态，任何 checkout、stash、merge 或 remote 修改前都核对任务、clean 状态、ownership 和授权，不盲目纠正。
- `projects/manifest.yml` v1 只兼容读取；使用 canonical `buildr sync <agent>` 迁移，不手工编造 UUID 或由页面静默迁移。`buildr web` 可查看 Project/Git 状态并受控修改 `name`、`description`；项目登记及关联可通过全局资产界面维护；Git 克隆仍由智能体根据明确来源执行。
- Project可以按需维护可选`verification.yml`，只接受closed`buildr.project-verification/v4`测试地图，声明少量稳定测试体系的Project/Service scope、purpose、sourcePaths、testRoots、完整入口、选择指导与环境要求；不复制具体测试清单、Task计划或运行结果。Agent直接调用项目工具执行测试，开发完成后只通过Task Verification Application保存有意义报告。Project也可按需维护可选`preparation.yml`，声明Project-wide或Service-scoped真实准备入口；Agent只在当前动作需要时读取并直接调用，不保存Task Plan或执行状态。初始化、刷新、Project/Service注册、首次Task或专业gap先路由`declaration-intake`做只读发现；已确认入口的普通维护按 `routine-maintenance` 交给声明所有者；新增范围、能力、外部效果或长期边界变化按 `user-decision-required` 取得用户决定。

## 遗留 Practices

- Practices 不再是独立 Buildr 资产类型；已有 workspace 或 Project `practices/` 是用户保留数据，不得自动读取、迁移、覆盖或删除，也不得因其存在阻塞正常命令。
- 用户决定整理时，先人工审阅内容语义：约束和值守边界迁移为 Rule，可复用专业动作和操作流程迁移为 Skill，产品事实、需求和变更迁移为 OpenSpec，其他说明保留为普通 docs。
- 不根据文件名或正文猜测迁移类别；用户确认内容已经妥善归类且目录为空后，才由用户自行决定是否删除遗留目录。

## 服务与代码库

项目（Project）通过 `projects/manifest.yml` 的 `serviceIds` 引用服务（Service）；全局 `services/manifest.yml` 中每个服务只引用一个 `repositoryId`，多个服务可以共用代码库实例（Repository Instance）。实例的来源、远端和集成分支在 `repositories/manifest.yml` 维护。新代码库使用 git 来源并对应真实 Git 根目录；工作空间自身仓库使用路径 `.`，服务子目录写入 `modulePath`。已有本地仓库允许不声明远端；旧 workspace 来源只兼容读取，不虚构 Git 地址或集成分支。

先运行 `buildr assets inspect --target <workspace> --json` 读取当前对象、版本和引用；这不是 Git 状态检查。界面服务与代码库列表分别使用 `/api/v1/services`、`/api/v1/repositories`；单仓库状态通过 `/api/v1/repositories/:id/status` 按需读取，完整关系接口不扫描 Git。新目录流程的服务规则位于实际服务目录；旧 `services/<code>/AGENTS.md` 保留兼容读取，代码目录的实际规则继续适用。结合任务明确选择项目业务上下文，不把所有引用项目的规则自动拼接，也不按当前目录猜测业务归属。

### 维护登记与关联

使用 `buildr help assets` 查看当前维护入口。写入 JSON 输入包含刚读取的 `revision`；创建项目可包含 `serviceIds` 和 `newServices`，每个新服务选择已有 `repositoryId` 或嵌套新 `repository`。新增表单默认从 Git 地址最后一段去掉末尾斜杠与 `.git`，填写代码库标识及 `repositories/<末段>`；手动输入优先，已有代码库不自动改标识或目录。创建代码库只登记来源，界面保存不代表已克隆。关联写入通过 `assets associate <project-id>`，解除只移除项目引用，保留服务和代码。

旧项目内服务清单可兼容读取；`migrationRequired` 为 true 时先检查转换后的身份、重复代码与实际目录，再显式执行 `buildr assets migrate --target <workspace> --input <json-file> --json`。迁移保留旧标识及代码位置，不按相同 Git 地址合并实例，不搬动代码。旧项目中的服务代码重名时，在迁移输入中明确提供 `codeMappings`，以旧 `project/service` 为键、新全局代码为值；核对映射后再写入。旧 `service create <project>/<service>` 仅用于尚未迁移的工作空间；迁移后使用全局资产入口。

移除项目、服务或未被引用的代码库登记使用 `buildr assets remove <project|service|repository> <id> --target <workspace> --input <json-file> --json`，输入只包含当前 `revision`。先说明受影响引用；移除只取消登记及关系，保留代码、文件与历史任务。核对返回清单确认对象及相关引用已移除，不把文件保留误报为删除失败。

旧 workspace 子目录登记需要归并时，先核对实际 Git 根和模块目录，再执行 `buildr assets normalize --target <workspace> --input <json-file> --json`，输入包含当前 `revision`。动作按真实根归并仓库并重算服务 `modulePath`，保留服务身份，不按相同远端合并不同目录。失败时保留原声明；成功后核对仓库数量、模块定位和旧服务文档。

服务编辑可在 `assets update service <id>` 输入中提供嵌套 `repository` 草稿，与 `repositoryId` 互斥。新代码库登记和服务引用在同一事务保存；失败不留部分登记，取消草稿不写入。

### 已有目录与新建

项目使用 `assets project-candidates` 和 `assets register project`；服务使用 `assets service-candidates`，创建输入的 `service.directoryMode` 为 `existing` 时提供候选 `directoryPath` 和 `directoryObservation`，为 `create` 时提供 `projectCode`，在 `projects/<项目>/services/<服务标识>/` 新建。项目内嵌新增由父项目提供位置。系统解析并复用代码库，内部 `modulePath` 不作为服务目录选择输入；未准备的代码库不得报告为可用。

代码库使用 `assets repository-candidates` 选择尚未登记的真实仓库根，创建输入包含 `path` 和候选 `observation`。保留外部绝对路径输入；不执行克隆、搬迁或远端改写。被服务引用的代码库必须先调整引用再移除。

技能网页支持选择 `skills/` 下未登记目录，或新建本地技能；通过命令重新登记保留目录时使用 `skills add --source <原目录>`。移除只取消登记，已有投射需另行同步，不声称其他会话已卸载。永久删除代码和文件属于未来独立功能；兼容的 `assets delete` 仍只取消登记，不可作为永久删除入口。

### 修改代码库声明

使用 `buildr assets update repository <id> --target <workspace> --input <json-file> --json`，输入包含最新 `revision`，可修改 `name`、`description`、`url`、`remote`、`integrationBranch`、`path`；省略字段保留原值，空 `url` 撤销远端声明。无远端的本地仓库也能独立设置集成分支（Integration Branch）。稳定身份与服务引用保持不变。

查看和编辑时通过 `/api/v1/repositories/:id/local-config` 读取真实本地远端配置，不从声明缺失推断本地未配置；已声明目标与实际不一致时分别展示，不能把当前任务分支当作集成分支。读取不写回清单。

保存不执行 Git 写入。读取单仓库状态中的 `alignment` 与实际值，核对远端、根目录和服务模块；`pending` 表示尚需对齐，当前分支不同不自动要求切换。需要改远端、克隆或搬迁时先说明具体动作与影响，在相应授权内执行，保留原代码与未提交内容。后续工作树（Worktree）未显式指定起点时使用声明的集成分支，明确任务起点优先。

### 准备真实代码

1. 沿项目引用、服务的 `repositoryId` 和可选模块目录定位目标实例；声明缺失时先从用户明确输入或可信源补齐 Git 地址与集成分支，不猜测。
2. 核对目标位置和真实 Git 边界。新受管实例默认使用 `repositories/<code>/`，创建输入可用 `path` 指定工作空间根、内部目录或外部绝对路径；已有实例沿用声明位置，附接目录不因登记获得内容所有权。
3. 已登记而代码缺失时，在当前任务授权内验证远端分支，克隆到空的目标位置；先暂存后发布，失败保留可核对结果。来源、权限或分支问题只阻止依赖该实例的工作。
4. 目录已经存在时核对来源、分支和未提交内容；身份不符就停止相关写入。不得覆盖、清空、丢弃改动或为了匹配声明擅自切换共享目录分支。
5. 验证实际目录、来源、当前提交和分支，说明已准备或失败事实。并行研发按任务使用隔离工作位置；当前任务分支不覆盖稳定集成分支声明。

本地检出目录（Checkout）是代码库实例落地的位置，不另建长期业务对象。规则（Rule）保护身份、授权与内容边界；以上过程由技能（Skill）指导智能体（Agent）按真实现场执行。

## Builtins

- 核心规则位于根 `AGENTS.md` 受管区块，不是独立内置项；专业规则（Rule）、技能（Skill）和命令（Command）仍由各自清单管理。
- 查看 workspace 内置能力状态：`buildr builtin list --target <dir> --json` 或最终 doctor。
- 卸载 optional 内置能力：`buildr builtin uninstall <id> --target <dir>`；required 能力不能卸载。
- 恢复 optional 内置能力：`buildr builtin restore <id> --target <dir>`。该命令表示用户已确认放弃此 Builtin 的本地修改；若当前 Builtin 声明 predecessor，只能接管 manifest 可证明为 Buildr-managed 且路径匹配 package 声明的旧 identity，ownership 不明或目标冲突时仍须停止。replacement source 恢复后继续运行 `buildr sync <agent> --target <dir>` 收敛当前 Agent runtime，不要求用户手工移动 Skill 目录。

## Components
- Component 是 workspace 级统一生命周期单元；当前不支持 Project/Service Component。registry 为 `components/manifest.yml`，成员由 installed `component.yml` 唯一声明。
- Component 必须自证 definition、全部成员 integrity、唯一 ownership 和 Skill Contribution 完整性；不能注册或注入 runtime adapter、runtime hook、可执行 member 或 registry patch。验证通过的 Contribution 只作为通用 runtime source input。
- Sidebar 是对外部能力的独立、可卸载增强；Skill Contribution 是其 runtime 组合机制。外部 Skill 源必须保持上游正文，Buildr 增强只进入 Agent runtime 派生版本，不在 `skills/buildr/` 维护外部 fork。
- 用户明确说“作为 Component”时，即使只有一个成员也走 Component；用户明确要单项 Rule、Skill 或 Command 时走单项入口。
- 用户只说“安装 X”时，先读取权威来源并识别会安装的资源；跨资产类型或需要统一版本、更新、卸载时创建或选择 Component，组成不明时继续调查，不让 CLI 猜测。
- 安装前用 `buildr component list/check --target <dir> --json` 核对来源、版本、成员和 integrity；执行 `buildr component install <id> --agent <agent> --target <dir>`。
- 用户只说“卸载 X”时，先查询 registry、ownership 和 `component check`。若 X 是 Component 或其成员，不得调用单项删除命令。
- 卸载前展示 Component id、source、version、workspace scope、将删除的 Rules、Skills、Command collections 和当前 Agent runtime 投射，并说明不会删除本机外部 CLI 或任何 Project 内容；取得用户针对该完整范围的明确确认。已有确认覆盖完全相同范围时直接继续。
- 只有完整范围已获用户明确确认才运行 `buildr component uninstall <id> --agent <agent> --target <dir> [--reason <text>]`；拒绝、未确认或范围变化时不得写入。
- install/uninstall 必须完成指定 Agent runtime reconcile 和最终 doctor；仍有 error 时不得报告完成。

## Rules

- Rules 源资产是当前 scope 的 `AGENTS.md`、`rules/manifest.yml` 和 `rules/`。
- Rules 控制 Agent 的价值观、边界和约束；Skills 封装可复用的专业动作和操作流程。
- Rule 和 Skill 不以“是否必须加载”作为本质区分；Rule description 是 Agent 判断规则语义相关性的索引，不是路径或角色路由表。
- Agent runtime adapter 按“scope 祖先链 + scope 子树”发现和投射 `AGENTS.md`，不替 Agent 判断 optional Rule 与任务的语义相关性，也不使用预设 role/path 路由。
- 按根 `AGENTS.md` 的启用、安装与语义相关性规则读取 Rules；Rule 与 Skill 不以是否必须加载作为职责区分。
- root/Organization 规则新增：先创建并编辑 `rules/<rule-id>.md`，再运行 `buildr rules add <rule-id> --target <dir> --description <text>`；未传 `--path` 时默认注册 `rules/<rule-id>.md`。
- root/Organization 规则删除：运行 `buildr rules remove <rule-id> --target <dir>`，同时删除 manifest entry 和规则文件；如只取消注册并保留文件，使用 `--keep-file`。
- Project/Service 规则分别通过对应目录的 `AGENTS.md` 维护，不使用 Project 或 Service 级 `rules/manifest.yml`。
- 需要渲染到 Agent runtime 时，运行 `buildr rules render <agent> --scope <workspace-relative-path> --target <dir>`；Codex 原生读取，Claude Code 使用逐 source bridge，Cursor/Qoder/TRAE 使用 scoped vendor rules，TRAE Work/WorkBuddy 使用 root reference bridge。具体路径、reload/UI 前置条件以及 `documented` / `verified` 证据等级见随包 `docs/agent-runtime-adapters.md`；GUI smoke 保持一次性人工 Prompt，不自动点击或抓取应用私有状态。
## Commands

- Commands 分为三层：workspace `commands/manifest.yml` 与 `commands/**/manifest.yml` 是唯一 catalog definition source，Project `commands.yml` 只保存 requirement references，实际 binary/version/login 属于 user/machine environment。
- 新增或替换 catalog definition 用 `buildr commands add`，删除用 `buildr commands remove`；`--collection <path>` 选择嵌套 collection。Component-owned collection 只能通过 Component 生命周期维护，删除最后一个仍被 Project 引用的 definition 会整次零写入。
- 用户说明某个 Project 需要工具时，只在 `projects/<project>/commands.yml` 维护 `id`、`required`、可选 `version` 和 `purpose`；不得复制 executable、version probe 或 install hint。
- doctor 已聚合 Commands 分层检查；单 Project 使用 `buildr commands check --project <project> --target <dir> --json`，跨 Project 重复传入 `--project`，无 Project context 只检查 workspace defaults。
- Commands 只声明和检查，不渲染到 Agent runtime、不安装 binary，也不保存 token、cookie、登录态、license 或个人配置。
- machine observation 不满足 requirement 时，按 catalog `installHint` 或官方链接说明差异；安装、升级和登录配置必须取得用户授权。

## Skills

- Workspace 是唯一 Skill source authority：源资产位于 workspace `skills/manifest.yml` 与 `skills/<skill-id>/`。Project 只在 `capabilities.yml` 引用 workspace Skill 并声明 requirements/bindings/applicability，不作为安装或可见性边界。
- 本地作者型 Skill 可以只适用于某个 Project，但内容仍在 workspace 维护，由 Project applicability 表达业务范围；远端发布型 Skill 适合已发布或外部维护的 Skill。
- Buildr 随包场景化流程通过 workspace Skills 承载；Rule 保留 Agent 价值观、边界和约束。
- 本地作者型：`buildr skills add [<id>] --source <skill-dir> --target <workspace>`；移除登记用 `buildr skills remove <id> --target <workspace>`，保留本地源目录和全部文件；组件受管技能继续走组件维护入口，不能借此删除成员。旧 `--scope .` 只作 deprecated 兼容；Project scope 已不受支持。
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

## 安装与更新

用户要求安装 Buildr 时，从 npm Registry 安装 `@buildr-ai/buildr`，验证 CLI 与 `buildr web`。只有明确需要图形入口时才执行 `buildr web launcher install`，并核对同一 npm installation、Host Node 与 package entry；普通安装不改 Applications / Start Menu，也不写未知工作空间（Workspace）或用户运行时（Runtime）。

用户要求“更新 Buildr”或“同步 Buildr”时，以及完整检查 Buildr 安装状态时，先运行 `buildr update check --json`，说明 `stable` 的 GA 正式版和 `candidate` 的 RC 候选版。用户尚未选择时，询问更新轨道或暂不更新；已有明确选择且范围未变时直接继续，不得自动切轨或降级。

按用户选择运行 `buildr update --track stable|candidate`；成功后重新解析当前入口，再执行 `buildr skill install <agent> --target <dir>`。用户明确要求“只更新 CLI”时不追加技能安装、工作空间（Workspace）同步或诊断。更新受阻时保留实际效果，不用旧 CLI 继续安装技能（Skill）。

## 工作空间更新与检出变化

用户要求“更新 workspace”或“同步 workspace”时，先判断根目录是否受 Git 管理：是则解析 `buildr.git-operations/v1`，向所选提供者（Provider）提供明确 workspace、upstream 和 update operation，安全更新后运行 `buildr sync <agent> --target <dir>`；不是 Git workspace，直接运行 sync。该目标不先更新 CLI；已包含同步授权，不重复询问 sync。

遇到本地改动、分叉、冲突、缺少 upstream 或需要用户选择的策略时停止对应更新，不自动 stash、reset、rebase、merge、覆盖，也不继续 sync。能力不可用只停止相关分支，不手写替代路由。

任一提供者（Provider）返回 `treeChanged: true` 后，对相关工作空间（Workspace）执行当前智能体（Agent）的 Doctor。协作者的 upstream 提交属于普通更新；本地没有协作者任务是正常事实，不能按作者、HEAD、脏目录或投射漂移补造任务或交付记录。

Doctor 只指向当前智能体（Agent）受管源或运行时投射陈旧时，执行一次适用的 `buildr sync` 并消费最终诊断；仅在缺少该范围授权时询问用户是否由 Agent 立即同步，并提供准确手动命令作为备选。包含 CLI、组件（Component）、命令（Command）、Git 或其他问题时，分别交给对应所有者，不能把一次同步称为完整修复。当前 session 是否重新发现新资产由 Agent runtime 决定。普通同步不创建任务、工作树（Worktree）、验证或自举证据。
