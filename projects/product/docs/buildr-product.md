# Buildr Product

Buildr 是为组织和 Agent 构建的工作资产治理系统。

它把散落在员工个人经验、文档、仓库和不同工具中的工作事实与工作方法，统一组织成共享、可审计、可适配不同 Agent 的组织工作资产。

产品简介使用：

```text
Buildr turns how your organization works into shared work assets for AI agents, portable across Agent runtimes.
Buildr 将组织的工作方式沉淀为 Agent 可用的共享工作资产，并让这些资产适配不同 Agent runtime。
```

任何人进入组织都可以从一句自然语言指令开始，由 Agent 准备工作环境并进入任务。

Agent 是这些工作资产的主要使用者。人通过 Agent 表达目标、提供业务判断并确认重要决策；Agent 从组织化资产中发现当前任务需要的信息和能力，建立任务上下文并引导工作。Agent 能在现有工具、权限和安全边界内完成的 Buildr 动作，默认由 Agent 在取得必要授权后直接执行；手动命令是用户主动选择或 Agent 无法执行时的兜底，而不是默认交付方式。

## 定位

Buildr 的核心心智是：

```text
Organize work in Buildr. Work through Agents.
在 Buildr 中组织工作，通过 Agent 开展工作。
```

Buildr 保存组织长期复用的工作资产，并通过可诊断、可按 Agent 运行时适配器（Agent runtime adapter）渲染的确定性工具层，把这些资产变成 Agent 可使用的共享工作环境。这个“工作环境”是产品体验，不是新的资产类型；事实源仍是 Buildr workspace 中的标准工作资产。

Buildr 不是另一个 Agent，也不与 Agent 抢活。Buildr 负责治理和投射工作资产、提供确定性工具与诊断；Agent 负责理解目标、发现相关资产、形成任务上下文并推进任务；人负责目标、业务判断与必要授权。

Buildr 的核心产品哲学是：**Buildr 应该约束 Agent 不要做错事，而不是要求 Agent 必须通过 Buildr 才能做事。** 产品能力和 Workspace 工作资产可以提供事实、指导、安全默认值与恢复建议，但只有放行会造成越权、错误对象写入、未经授权或不可逆副作用、覆盖他人工作、证据失真或完成误报时才设置硬门禁。Buildr 自身的内部登记、推荐流程或自动化信心不足，不应成为 Agent 推进真实专业工作的通用阻塞点；完整原则以随包 [Buildr Core](../services/buildr/resources/workspace/rules/buildr/core.md) 为准。

## 要解决的问题

真实组织长期使用 Agent 后，问题很快从“Agent 能不能完成一次任务”变成“组织如何让 Agent 持续按照共同的工作方式完成任务”：

- 员工个人探索出的工作方法停留在本机、聊天记录或个人经验里，只能靠文档、会议、IM 和口口相传复制给其他人，难以持续沉淀为组织资产。
- 团队切换 Agent 工具，或成员分别使用不同 Agent 时，需要在每个客户端重复维护工作环境，组织资产容易漂移。
- 一个业务项目往往包含多个代码仓、公共服务和服务级规则，Agent 在单个仓库中工作时难以获得端到端项目视野。
- 产品、设计、开发、测试和发布内容分散在不同岗位与工具中，Agent 往往只能感知当前工作范围内的信息，难以主动发现其他岗位或服务中与任务相关的依赖。
- 手写 runtime 文件容易冲突、过期，或把临时提示误当成组织长期资产。

Buildr 把个体员工积累的工作事实和工作方法转化为组织可以共同维护的工作资产，再按 supported Agent runtime 的能力投射必要入口。不同成员和 Agent 可以从同一组织基础开始工作，让个人探索成为可共享、可传承、可持续演进的组织价值。

## 工作信息、工作资产、任务上下文与 Context Window

Buildr 管理的是工作信息空间中适合长期复用的组织工作资产，不是全部工作信息，也不是 Context Window：

| 概念 | 含义 | 责任主体 |
|---|---|---|
| 工作信息空间 | 所有潜在可用于工作的来源，包括 Workspace 文件、数据库、API、网页、聊天、机器状态、用户输入和工具结果 | 多种来源；不等于 Buildr 管理范围 |
| Workspace | 工作范围、治理根和发现入口，可同时包含受管资产、普通代码、临时文件、依赖和本机配置 | Buildr 维护范围 identity 和受管入口；位于其中不等于被治理 |
| 工作资产与共享工作环境 | 被明确组织、登记或纳入治理的长期工作事实与工作方法，以及它们经组织和 runtime 投射后形成的整体环境 | Buildr 组织、治理、投射和诊断 |
| 任务上下文 | Agent 为具体 Task 发现、检索、判断、选择、组织和压缩后实际使用的语义工作集 | Agent 根据任务语义形成；可使用 Buildr 资产和外部授权信息 |
| Context Window | 某一次模型调用实际装入的有限临时输入，是 Task Context 在该时刻的有限投影 | Agent/runtime 按当前调用选择和加载 |

Buildr 不替 Agent 填充 Context Window，也不保证把所有信息都加载进去。它提供可发现、可选择、可使用的组织化资产，让 Agent 有基础形成 Task Context；Agent 也可以通过文件检索、数据库/API 查询、网页、语义检索、MCP 或其他授权来源补充任务信息。具体检索工具不是 Buildr Context 模型的一部分。runtime adapter 只负责发现和投射标准资产，不替 Agent 判断哪些内容与当前任务相关。

Context 表示某个工作范围中可供 Agent 发现、选择和使用的候选信息；Workspace Context、Project Context 和 Service Context 是范围限定，不等于已经加载的模型输入。Task Context 是语义工作集，Context Window 是单次调用的技术容器；一个长期 Task 可以跨越多个 Context Windows。

“工作事实”与“工作方法”是对工作资产的公开解释，不是新的存储分类，也不封闭 Buildr 可以治理的资产类型。

组织工作资产是开放概念，不由当前资产类型穷举。未来可以探索 MCP、hooks 或其他形态，但它们只有在独立 change 明确模型、生命周期、安全边界和 runtime 行为后，才是 Buildr 已支持的受管资产；Roadmap 设想不能替代当前事实。

## 核心模型

```text
Organization/Root
  └── Project
        └── Service
```

- **组织（Organization/Root）**：Buildr 工作区根，也是个人或组织的资产根。
- **Project**：业务、产品线、系统或长期工作单元，不等同于单个代码仓。
- **Service**：Project 管理的代码仓、应用、模块或可执行资产。
- **Agent runtime**：Agent 实际运行资产的位置，是面向当前 Agent 的可重建入口。

工作空间、Project 与 Service 可以各自拥有独立 Git repo，也可以沿层级共用同一个 Git repo。Buildr 按真实 Git 边界维护 Project registry 与 Service registry，不把目录层级误判为 Git 边界。

## 工作资产

下表只描述当前实现的主要资产形式，不定义 Buildr 未来能力的封闭边界：

| 资产 | 作用 |
|------|------|
| Rules | 通过 `AGENTS.md` 和 `rules/` 维护 Agent 行为边界 |
| OpenSpec | 管理能力规范、业务知识、变更过程和归档记录 |
| Skills | 管理可渲染到 Agent 原生技能系统的任务能力 |
| Components | 在 workspace 统一安装、更新和卸载 Rules、Skills 与 Command collections |
| Commands | workspace catalog 定义外部 CLI，Project requirements 表达业务需要，本机只提供可观察状态 |
| Project registry | 以 UUID、workspaceId、code、name、description 和 ProjectSource 记录 Project Domain；文件 manifest 是当前持久化实现 |
| Service registry | 以 UUID、workspaceId、projectId、code、name、description、type 和 ServiceSource 记录 Project 下的 Service Domain；规则入口由 Service 目录 `AGENTS.md` 表达 |

Buildr 源资产不保存 binary、token、cookie、登录态或个人私有配置。

Skill 的来源、Component 组合、能力依赖、runtime 投射和 Doctor/receipt 分层详见 [Buildr 技能体系](architecture/buildr-skill-system.md)。

Practices 不再是独立受管资产。已有 workspace 或 Project 中的 `practices/` 属于用户保留数据，Buildr 不会自动读取、迁移、覆盖或删除，也不会让该目录阻塞正常命令。整理遗留内容时，由用户或 Agent 人工审阅语义：约束和值守边界转为 Rule，可复用专业动作和操作流程转为 Skill，产品事实、需求和变更转为 OpenSpec，其他说明保留为普通 docs。

Component 是 workspace 源资产的生命周期边界，不是可执行插件。Agent 负责根据用户意图和权威来源识别资源组成，CLI 必须校验 Component definition、全部成员 integrity、唯一 ownership 和 Skill Contribution 完整性后，才能把验证通过的源输入交给 runtime 管线。Component 不能注册、替换或注入 Agent runtime adapter，也不能提供 runtime hook、可执行 member 或 registry patch。当前只支持 workspace Component；它只能拥有 workspace Command catalog collection，不能拥有 Project requirements 或本机状态，删除仍被 Project 引用的 definition 必须在事务前阻止。

Commands 不采用 Skill 的 render destination 模型。workspace `commands/**/manifest.yml` 是定义 authority，`projects/<project>/commands.yml` 只引用 Command ID 并声明版本与 required/optional，实际 binary、版本、登录态和凭证属于 user/machine environment。Buildr 只做分层诊断，不 render/install binary，也不保存个人配置。

## 人和 Agent 如何协作

Buildr 采用 Agent-first 的协作方式：Agent 是产品能力和组织工作资产的主要使用者，人是一等参与者，但通常不需要直接操作 Buildr 的全部内部模型。

典型方式是：

```text
用户：使用 Buildr 管理这个项目。
Agent：读取 Buildr Skill 或 bootstrap guide。
Agent：先识别当前 runtime adapter，再调用 Buildr CLI 初始化、诊断、创建 Project、接入 Service 或同步 runtime。
Buildr：写入源资产并通过 doctor 输出事实状态。
Agent：发现任务相关资产、根据诊断推进工作，并在需要业务判断时引导用户。
```

CLI 是 Agent 的确定性执行层。Agent 负责理解目标、发现相关信息、编排动作和解释结果；人负责目标、边界与关键判断。涉及 workspace 资产变更时，Agent 应调用 Buildr CLI 或做可验证文件变更，并在状态变更后运行诊断。只要 Agent 能安全完成且已取得必要授权，就应直接推进动作，不把命令复制给用户代为执行；需要手动处理时，必须说明 Agent 无法执行的原因并给出准确兜底方式。

doctor 是轻量、通用的 workspace 事实入口，不是所有专项验收的合集。它每次检查 canonical workspace identity、mutation 与 root registries，并在相关资产或 runtime adapter 适用时执行条件通用检查；Git 操作 readiness、OpenSpec change 契约、构建和测试仍由对应专业工作流负责。显式 `--agent <agent>` 选择当前 runtime 并让其 actionable findings 参与 readiness；未选择 Agent 时只检查有 Buildr managed marker/receipt 的 runtime inventory，未选中 runtime drift 不降低通用 workspace readiness。doctor 的 `ok` 只保持“没有 error”的兼容含义，是否可直接继续工作以独立的 `health.ready`、`health.actionRequired` 和根因化 `repairPlan` 为准。

这种结构让不同岗位不必先把各自工作内容手工整理成一份给当前执行者的临时说明。只要相关内容已经作为 Project 或 workspace 工作资产被组织，Agent 就能在任务需要时发现它，为跨服务、跨岗位的端到端工作提供共同基础。Buildr 不使用固定岗位路由，也不承诺自动推断所有依赖；语义相关性仍由 Agent 根据任务判断。

### Buildr Web：人的认知与治理入口

Buildr Web 不是第二个 Agent，也不是聊天客户端或任务执行器。它帮助人理解当前 Workspace、Project 与可选 Service 的真实范围，查看可解释状态、维护名称和说明等低风险 metadata，并生成带 canonical scope 的 prompt 交给 Agent。

第一次使用时，Buildr Web 先解释 Workspace 是人和 Agent 共同工作的顶层目录，再渐进引导 Project（业务、产品、系统或长期工作）与可选 Service（代码仓、应用、模块或可执行资产）。Service 不是开始工作的门槛：没有 Service 的 Project 可以直接交给 Agent 推进。

真正的创建、迁移、修复和专业任务仍由 Agent 在核对目录、Git、授权和适用工作资产后执行与验证。Buildr Web 与 Agent-only 入口都从同一 Workspace 源资产读取事实，不维护独立数据库、聊天记录或完成 checklist。任何试图让 Buildr Web 承担对话、自动规划、Agent session 管理或专业执行的新能力，都必须单独证明它具有长期治理、跨 Agent 复用、确定性约束或可验证诊断价值；否则保留给 Agent。

## CLI 产品表面

Buildr 按用途和承诺区分三层 CLI 产品表面：

| 分类 | 含义 | 可见性 |
|---|---|---|
| primary | 普通用户或 Agent 的 workspace onboarding、资产 lifecycle、诊断、修复和 runtime 主路径 | 根帮助主区、主题帮助、主产品文档和 bootstrap canonical 示例 |
| agent-machine | Agent、Skill 和产品 Application 依赖的低频确定性接口，例如 Review/Verification Result、Task Environment 与 Finish | 根帮助独立分区、完整主题帮助和稳定命令契约 |
| maintenance | 产品构建、开发预览和 OpenSpec workflow 编排 | 根帮助维护分区、维护文档、workflow Skills 和产品验证 |

该分类只控制可发现性与兼容承诺，不是权限或安全边界。`agent-machine` 与 `maintenance` 命令仍然可执行并具有 canonical help；具体授权、安全和 effects 继续由对应 Application/Skill contract 决定。

当前`package check/build`、`web preview *`、`openspec converge`与`openspec convergence inspect`属于maintenance。`openspec audit`、`openspec baseline create`、阶段型`openspec check`、`openspec sync-plan`、`openspec sync-apply`与`skills migrate-project-assets`已删除；旧调用返回标准unknown-command。确定性planning/apply仅由Converge事务内部持有；Inspect只读仍存在的未决事务Receipt，正常archive或环境清理后不运行。legacy Project Skill source不受支持且当前Buildr不执行自动迁移。`package:<source-id>`是package manifest与随包Skill resolver的内部source identity，不是用户资产id或公开source scheme。`service create --rules`仅保留deprecated warning compatibility no-op；canonical Service规则入口是Service目录中的`AGENTS.md`。

## Runtime 投射

Buildr 的原则是：

```text
Install to Buildr, render to Agent runtime.
```

Buildr 资产是源头；Agent runtime 是面向当前 Agent 的可重建入口。Workspace 就是 Buildr 治理的工作目录，也是 Skill 唯一 source authority；Project 是业务、依赖、适用性和 capability context，不是 Skill 安装隔离层。Skill 只在 workspace `skills/` 维护，再显式 render 到当前工作目录的 `workspace` destination 或个人的 `user` destination。Buildr 在写入前检查同名 identity、ownership、receipt 与完整目录 digest；冲突会阻止整次写入。

当前本地产品通过 `buildr web` 启动或复用只监听 loopback 的全局本机 Web 应用，并在默认浏览器中提供工作空间（Workspace）、项目（Project）、服务（Service）、任务（Task）与变更（Change）管理视图。用户级登记列表只保存 Workspace root 和最近使用项；Workspace identity、metadata 与下属资源仍由各 Workspace 文件实时提供，不建立跨 Workspace 第二事实源。Buildr Web 是任务记录（Task Record）的观察与有限维护客户端：正式 Task 由 Agent/Task Manager 创建，页面只允许编辑、完成和放弃已有 active Task。任务列表和概览使用同一 Task Record Application 的 SQLite stored-state query projection，支持封闭筛选并派生直接 Child 数量，不在首屏解析 Change 或专业 currentness；复盘处置筛选只消费已保存的状态列。Parent 候选按操作延迟读取。任务详情固定为“概览、研发、证据、复盘、环境”五个一级视图。“研发”只读调用 Task Development Application `inspect`，展示当前结论、候选、门禁、决定与最近保存的研发交接；“证据”分别调用 Task Review 与 Task Verification reader，任一读取失败不隐藏另一份证据；“复盘”保持 Markdown 报告只读，但可通过同一 Task Retrospective Application 标记已处理、无需处理或重新打开；“环境”继续只读调用 Task Environment Application。页面不提供 Development mutation、Environment prepare/cleanup 或专业 Result CRUD。全局 Change 视图保持 retained-only；用户在全局 Change 详情主动打开关联面板后，页面才读取 active Task stored-state projection，并以既有 `recordDigest` mutation 保存 Change reference（只保存引用，不复制变更文件），不把 Task/Environment/Git 读取带入首屏；从 Task 打开 stored Change reference 后，具体页面才按 matching Task Environment execution root 与 retained baseline 分开显示 provenance，其审查按钮进入同一 Planning Review action。

Buildr当前只通过npm Registry正式分发完整CLI与`buildr web`，主进程使用满足`engines.node`的Host Node。用户可显式运行`buildr web launcher install`生成macOS `.app`或Windows Start Menu shortcut；该图形入口只绑定同一npm安装并执行`web`，不复制Node、Buildr或payload，也不引入Desktop WebView或第二更新渠道。普通CLI不启动HTTP，关闭浏览器不等于退出服务。Buildr Web与自包含平台安装器为未来产品阶段保留，当前未实现。

新建 Workspace、Project、Service 或 Change，以及继续 Change、Task Review，均只生成交给 Agent 的完整 prompt，不绕过 Agent 对范围、目录、Git、授权、OpenSpec 契约和 runtime 的判断。Task-scoped Change 使用 Task Review Planning route；全局 Change 的通用审查 prompt 保持原边界。已归档 Change 默认只读，页面不会直接创建、编辑、apply、sync 或 archive Change。portable工作资产继续由文件系统/Git承载；适合索引、关系、聚合和事务的本地structured data由每个Workspace独立SQLite承载。

Project Domain 使用 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`。文件系统场景必须保留 `source.path` 以定位真实 Project；独立 Git source 另外声明 URL、remote 和稳定的 `integrationBranch`。当前分支、HEAD、dirty、upstream 与 ahead/behind 会随任务变化，只由 Git adapter 实时观察，不持久化到 Domain，也不会触发 Buildr 自动 checkout、stash 或 merge。

Service Domain 使用 UUID `id`、所属 `workspaceId`、直接父实体 `projectId`、Project 内唯一 `code`、`name`、`description`、开放词表 `type` 和 `source`。`source.path` 使用 Workspace 相对完整路径定位真实 Service；独立 Git source 同样只保存 URL、remote 与稳定的 `integrationBranch`。当前 Git 状态属于观察视图，Buildr 只诊断偏移，不自动切分支或修改用户仓库。

不同 Agent 的处理方式不同：

- Supported adapter 由 Buildr 随产品发布的静态 registry 唯一声明；每个 adapter 明确声明 user/workspace destination roots、可观测 discovery roots、inventory evidence 与 activation，并完整实现 Rules entry、产品 Buildr Skill、workspace Skills、install plans 和 runtime check。
- Adapter 只描述 runtime-specific 投射并生成声明式 RuntimePlan；通用 core 统一完成 source assembly、计划校验、零写入冲突预检、compare/apply、受管 orphan 清理和 findings/repairs 聚合。
- 不同 adapter 可以复用 native `AGENTS.md`、reference bridge 或 Skills layout 等内置投射原语，但必须保留独立 identity、capability evidence 和测试，不能 alias 或 fallback 到另一个 runtime。
- `runtime list --json` 输出 trait catalog 和每个 adapter 的组合事实；新增 adapter 前只需向目标 Agent 收集 identity/surface、Rules、Skills、activation、checker 与最小 compatibility evidence，Buildr 的 RuntimePlan 和安全 reconcile 不重复调查。
- Rules scope 使用真实 workspace 相对路径。adapter 合并 scope 祖先链与 scope 子树中的 `AGENTS.md`，按目录层级由宽到窄投射；它不要求维护 role/path 路由表，也不替 Agent 判断规则语义相关性。
- Codex 原生读取各层 `AGENTS.md`，不生成规则桥接文件。
- Claude Code 通过 adapter 在每个已发现 `AGENTS.md` 的同目录维护 `CLAUDE.md` reference bridge；Skills 从 workspace source render 到 user 或 workspace 的 `.claude/skills/`。
- Cursor、Qoder 与 TRAE 将 `AGENTS.md` 投射为各自可检查的 scoped vendor rule files；TRAE Work 与 WorkBuddy 使用受管 root reference bridge。完整路径、activation、限制和证据状态见 Buildr Service 的 [Agent Runtime Adapters](../services/buildr/docs/agent-runtime-adapters.md)。
- 默认 `sync` 从 root `.` 递归 reconcile 整个受管理 workspace；扫描跳过符号链接、依赖/build/runtime 目录和未登记的嵌套 Git repo。
- 正式持久交付以最小Task Record记录意图与scope，但Task Record和Task Environment不是普通编辑、构建或有界测试的通用工作许可。直接工作只保留真实Git/测试事实，不产生Environment或正式Result；选择Buildr-managed checkout、Preparation、runtime projection、Task-owned资源、正式环境证据或自动Finish时，Agent才按Task scope形成Plan并运行`buildr task environment prepare`。Environment Receipt独占Declaration/Scope/Recipe/Step、实际执行根、Runtime/CLI、runtime projection、动态资源、ready/恢复与cleanup；Task Record不保存环境字段。
- `declaration-intake`统一承接Project/Service注册、首次Task、入口变化、Environment gap、Verification coverage gap及显式初始化/刷新：Agent只读发现`preparation.yml`与`verification.yml`候选或差异，用户确认精确长期写入后再分别交给`task-environment`与`task-verification` owner。Intake不新增store/writer，不管理`capabilities.yml`或`commands.yml`。
- Buildr Local 在 `.buildr/local/workspace.sqlite` 保存单机local-only structured data。Task Record、Development、Verification、Planning/Completion Review与Task Retrospective current records都以该数据库为唯一持久化authority；它们共用数据库但保持独立Domain、Application和writer。数据库不进入Git、runtime投射或跨机器同步；旧Task YAML不读取、不迁移、不双写。未来组织多人协作由独立Buildr Server/Cloud authority承担，不同步本地SQLite文件。
- `.worktrees/` 是多个 Task Environment checkout 的容器，不是主 Workspace、保留工作区或 Agent runtime。`task-worktree` 只提供 `buildr.git-worktree-provider/v1` 的 checkout/branch/HEAD/clean/registration evidence；`buildr worktree create|inspect|cleanup` 不代表 Environment ready，也不拥有恢复和总 cleanup。
- 正式 Task 的当前协调入口是普通 Task + Parent/Child + Buildr Web 动态投影。Task 顶层记录、Development、Review 与 Verification 分别由各专业 Application/read model 提供，consumer 不直接访问 SQLite，也不维护第二份 Board 进度或证据。既有 `openspec/knowledge/task-boards/*.html` 与 `task-cockpits/*.html` 保持原路径和原内容，只作为历史旁证；产品不再发布 `task-board` Skill 或创建新的静态页面。
- 选择Buildr-managed OpenSpec/Development路径时，实现型Change在propose前取得matching ready Task Environment；artifacts、实现、开发期测试和Formal Verification只写Environment允许的根，不与retained source双写。直接工作不得冒充该受管证据路径。
- `task-verification` 是 `buildr.task-verification/v3` 的默认 provider。Project 用可选 `buildr.project-verification/v2` 声明已有 capability 的 identity、Project/Service scope、调用方式、适用条件、可证明事实、交付要求，以及确有需要时的环境和副作用边界；声明缺失或能力不存在只形成 coverage gap，Verification 不自动开发测试。
- `buildr verification run` 只按显式 Project、capability 列表和 target identity 执行有界 command，返回 transient `buildr.verification-execution/v1`。完整输出、耗时、临时路径和资源事实只留在 execution evidence；production 不再维护声明级 plan/DAG 或固定 `minimal / affected / candidate` assurance。Buildr Product 自身的 `test:changed`、`test:candidate` 和 Product-only DAG 仍是该 Project 的真实测试实现，不成为其他 Project 的通用 policy。
- 每个正式 Task 在Workspace SQLite维护一份closed `buildr.task-verification-result/v2` current Result。唯一Task Verification Application从matching terminal Task Execution Records对账事实，事务整值替换Result，并在读取时按Candidate/generation、Content Target与declaration identities派生`current / stale / unknown`；合法v1 row只读兼容且为`legacy-unbound`。v2 Result只保存portable能力facts、closed evidence identities、coverage gaps和`passed / not-passed`结论，不保存stdout/stderr、Environment Receipt、风险接受或推进决定。CLI、Skill、Buildr Web和Task Development consumer复用该authority；Task Finish不读取、解释或发起Verification。
- `task-environment` 通过 `buildr.task-environment/v1` 管理正式 Task 的 prepare/inspect/cleanup；公共 CLI 不暴露内部资源 mutation。Preview 等已知 provider 在健康后登记为 Task-owned 动态资源，登记失败立即回收；Finish 只提交 cleanup eligibility，由 Environment 停止资源并调用 provider。真实 Agent session activation proof 属于 Task Verification，不进入 P0.2 Environment Receipt。
- `task-review` 通过唯一 `buildr.task-review/v1` capability 执行方案审查或完成审查。一个closed Result模型在Workspace SQLite维护Planning/Completion两个可选current slots；每份Result绑定明确目标identity，并如实记录执行方式、reviewed/uncovered、findings和结论。同类型事务完整替换、跨类型隔离，中断不覆盖旧值；读取时比较目标派生`current / stale / unknown`。Result不持久化revision、history、current、applicability或digest，也不生成Candidate、替代Verification或建立门禁。Task Review 与 Task Retrospective 是相互独立的专业能力。
- Buildr Product 的 delivery-required `product.delivery` capability 绑定明确 Content Target identity，并按 changed owner 选择 affected 或必要 full 证据；`product.full-regression` 是显式 Product Candidate 验证，不等于 Task Candidate。Git tracking、staging、commit、相同 bytes 集成、push 和 worktree 清理不改变 Content Target；交付内容或声明变化后 Result 派生为 stale。
- `task-development`是`buildr.task-development@2`的默认provider，也是Development Receipt、planning snapshot、Content Target、verification policy、Task Candidate/generation、gates/dispositions/decision与研发交接的唯一Application authority。它从ready Environment中的首个proposal、方案或直接实现等正式研发动作开始；节点可不存在、not-applicable或由明确授权waived，存在时只登记专业authority引用与identity。内容稳定后再形成Content Target/policy、formal Verification、Candidate、Completion Review、`proceed / blocked`与handoff。负向Result风险接受绑定精确Result digest；跳过整个适用gate绑定精确target、summary与authorization source。产品不公开Development CLI、写API或浏览器mutation。
- `task-finish` 是 `buildr.task-finish/v1` 的窄研发交接适配器。自动`task finish run`继续要求ready Environment并执行`preflight → prepare → verify → deliver → cleanup`；Agent也可直接Git/PR交付，再由`task finish reconcile`从current immutable handoff与真实remote重建同形逐repository Delivery。reconcile优先复用Environment；缺失或已清理时从Task scope、registries与实际Git topology构造只读上下文，不补造Receipt。多repository逐项checkpoint；全部Delivery成立后Task即completed，Activation、Environment Cleanup与Diagnostics独立投影，attention或not-applicable不撤销Delivery。Finish不收敛Change/current knowledge、不运行Formal Verification/Completion Review、不生成Candidate或风险决定。
  - retained Product phase provider自身若在无交付副作用的preflight/prepare抛出异常并阻塞修复Task，另行明确授权的existing-run `--bootstrap-recovery`仍通过完整retained registry与Application，并只在Execution Record成功open后，从current ready Environment及current Development handoff共同冻结的clean committed checkout建立唯一run-owned capsule。candidate模块只获得执行phase所需的封闭runtime façade；Application、SQLite repository、Execution Record与五阶段仍由retained controller写入。该能力禁止candidate CLI、任意模块路径与临时npm tarball旁路，同一capsule随same-run resume复用；cleanup phase先持久化passed，再由retained finalizer原子移走并撤销可执行source authority，最后执行terminal SQLite finalize。terminal写入失败时只用retained shell恢复同一run，不重新导入provider；隔离残留回收失败只记attention而不重放已成功阶段。入口、registry、Application、repository或migration层损坏不在恢复范围。
- `git-operations` 是唯一 Skill-only `buildr.git-operations/v1` provider。直接用户或上游 consumer 必须先明确 repository、operation、相关 ref、scope、授权和顺序；provider 只提供精确 staging、commit/push 分离、完整 push range、共享 commit 冻结、前后 identity、最小 Result 和部分失败 fail-closed 语义。它不新增 Application、CLI、Receipt、状态机或 transaction，也不并入独立的 `buildr.git-worktree-provider/v1`。
- `task-retrospective` 是 `buildr.task-retrospective/v1` 默认 provider。用户明确要求时，Agent 对 `completed|abandoned` Task 的执行时间、token消耗、重复尝试、人机协作和Buildr workflow/harness成本生成一份自由Markdown报告；精确数据不可见时明确数据缺口。Application在Workspace SQLite按Task ID维护唯一current row：Result v1 保持不变，另存 `pending|handled|no-action` 处置状态、说明和时间。重复复盘完整替换报告并回到 `pending`；Agent 和 Buildr Web 均通过 Application 的 current digest 保护处置写入。内部 provider 可按处置状态或显式 Task 集合执行有上限的批量只读检查，默认只返回 pending 摘要，正文需显式请求；它不形成跨任务分析聚合。`handled` 只表示已形成处置判断，需落地的改进另建正式 Task。该能力不采集隐藏推理或完整轨迹，不提供公共CLI、history或评分，也不进入Task terminal、Development、Finish或cleanup门禁。已退役的`.buildr/asset-review/`内容保持原样且不再读取、迁移或删除。
- “收尾”只授权可安全确定的常规动作，不授权 force push、merge commit、远端任务分支删除、丢弃改动、共享分支历史改写或语义冲突决策。
- 实际自举 workspace 的 sync 是独立状态变更，不作为相同 tree 的第二轮产品验证；若Finish已完成，sync后显式运行指定Agent Doctor；若Finish只被retained Doctor阻塞，则sync后用原run/token恢复，由Product重新运行指定Agent Doctor并在通过后cleanup。`buildr update` 只更新 CLI 来源。
- 其他 Agent 在存在 adapter 前，不使用 supported fallback adapter；Agent 应读取标准资产或 bootstrap guide 理解边界，并联系 Buildr 作者反馈 adapter 需求。

Task Finish在Workspace SQLite按Task只维护一行`task_finish_current`：总体状态、关键identity、失败、resume、cleanup、lease与时间为普通列，固定五阶段详情为受验证JSON；进行中保存run与prepared cleanup，完成时原位替换为compact terminal Result。target lease使用同行target/token/expiry做并发fencing，不另建phase、lease或artifact metadata表。完整诊断与Carrier只保留在run-owned transient root，并在成功后清理。`.buildr/task-finish` 是已退役的旧文件协议，启用 SQLite-only 前由受控步骤直接清理，不作为执行输入。`task complete` 只表达所有 Finish gates 通过后的 Task Record terminal status，不建立第二套 Finish 状态机。

## MVP 边界

Buildr 当前 MVP 已验证文件系统、Git、CLI、Buildr Skill、bootstrap guide 和 Agent runtime 渲染可以支撑人和 Agent 共同维护工作资产。

当前事实以 [Buildr current knowledge](../openspec/knowledge/overview.md) 为准；规范性行为以 [OpenSpec specs](../openspec/specs/) 为准。

MVP 不解决完整企业云服务、权限系统、托管 Web/SaaS、多用户协作、代码托管平台集成、跨机器自动恢复、系统级 hook 或所有 Agent adapter。

OpenSpec Component还包含Buildr自有的契约门禁sidebar：它在Requirement粒度检测active change冲突和陈旧delta，由唯一Converge事务完成投射验证、条件写入、确认与archive；事务Receipt在正常archive后释放。Convergence Inspect只处理仍存在的未决恢复现场，不是归档后的长期审计；OpenSpec CLI与上游workflow Skills仍可独立升级。

Sidebar 是 Buildr 对外部能力的独立、可卸载增强模式；Skill Contribution 是其通用组合机制。fragment 作为 Component member 参与 integrity 和统一生命周期：Buildr 自有 Skill 可使用稳定 slot，外部 Skill 使用 prepend/append boundary composition。runtime source assembly 先验证 Component 全部成员，通过后才由纯上游正文与 sidebar fragments 生成 Agent runtime 派生 Skill，不回写 workspace Skill 源。它不是 Adapter 扩展、可执行 Hook、事件总线或任意脚本机制。

Buildr 的数据完整性保护是不可卸载的 CLI core：资产 identity、scope path、ownership、符号链接、保护根和集合根在写入前统一校验；跨文件 source mutation 使用 workspace 单写者 transaction、atomic writer、staging、backup 和失败回滚。进程异常留下的 transaction 会阻塞后续 source mutation，并由 doctor 提供恢复入口。该能力不是权限系统，也不阻止用户或外部工具直接编辑文件。

产品维护命令 `package build --out` 将输出视为带版本化 receipt 和 integrity 的生成树；只替换仍匹配上次 receipt 的输出，不删除非空无 receipt 或已被修改的目录。

当前 Components 不包含 Project/Service scope、远程 registry、依赖求解、权限系统或可执行 Hook。

## Roadmap

本节只概括后续产品方向。详细设计候选见 [Roadmap 资料](roadmap/)；这些资料不是当前产品事实、可执行资产或已经批准的实施契约。当前实现以 [Buildr current knowledge](../openspec/knowledge/overview.md) 为准，规范性行为以 [OpenSpec specs](../openspec/specs/) 为准；具体方向进入实现前仍需创建独立 OpenSpec change。

后续产品方向包括：

- 以[Agent 时代的工作基础设施](roadmap/agent-work-infrastructure.md)明确长期产品边界：Agent 负责理解任务、选择 Workspace 与资产、形成上下文、自行编排和专业执行；Buildr Application Core 提供 Enterprise、多 Workspace、外部数据源、长期工作资产与可接续共享状态。飞书、Agent 原生界面和 Buildr 界面具有不同的用户价值，彼此的接入与会话承载方式仍待验证；ACP 是未来可研究的 Agent 接入协议，不是上下文编排器。
- npm-only发布能力：同一Application Payload只生成一次npm tarball，所有Host Node/Launcher smoke、publish和Registry readback复用同一bytes；GitHub Release只保存版本说明且拒绝binary Assets。真实tag、publish与公开readback仍由独立release授权触发。
- 更多 Agent runtime adapters；每个新增 runtime 仍需独立 change 明确 identity、兼容版本、投射 targets 和 contract tests，不能借用现有 adapter fallback。
- 更完整的 Skills registry、版本策略、强制 integrity policy 和 package 型远端解析；当前已支持 manifest、resolved `skill-url`、version/integrity metadata 和有界网络读取。
- 权限裁剪和治理门禁。
- 推进[Agent 自编排与上下文接续](roadmap/agent-context-orchestration.md)：由 Agent 根据任务跨 Workspace 检索，动态加载 Rules、Skills、Commands 和 Tools，自行提出 Task DAG、选择 subagent 或其他 Agent；Buildr 保存需要跨会话和跨 Agent 接续的 Task State、Decision 与 Evidence，不实现固定角色路由或通用 Planner。
- 将[历史角色能力拆解](roadmap/agent-roles/)继续拆成按任务动态加载的 Rules、Skills、Packages 和 capability contracts，不把岗位身份作为 Agent 的固定运行模型。
- 评估[原型开发能力设想](roadmap/prototype-development.md)是否应沉淀为可复用 Skill 或其他受管工作流。
- 更强的 project/service 资产同步与诊断。
- 继续收敛 Rule / Skill 分层；Rule 控制 Agent 的价值观、边界和约束，Skill 封装可复用的专业动作，场景化流程优先下沉为 Skill。
- 从文件系统/Git 逐步演进到可选的结构化存储和组织服务。

这些方向进入实现前，应先通过 OpenSpec change 收敛为可实施的需求和任务。
