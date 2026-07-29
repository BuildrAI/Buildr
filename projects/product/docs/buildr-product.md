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

### local app：人的认知与治理入口

local app 不是第二个 Agent，也不是聊天客户端或任务执行器。它帮助人理解当前 Workspace、Project 与可选 Service 的真实范围，查看可解释状态、维护名称和说明等低风险 metadata，并生成带 canonical scope 的 prompt 交给 Agent。

第一次使用时，local app 先解释 Workspace 是人和 Agent 共同工作的顶层目录，再渐进引导 Project（业务、产品、系统或长期工作）与可选 Service（代码仓、应用、模块或可执行资产）。Service 不是开始工作的门槛：没有 Service 的 Project 可以直接交给 Agent 推进。

真正的创建、迁移、修复和专业任务仍由 Agent 在核对目录、Git、授权和适用工作资产后执行与验证。local app 与 Agent-only 入口都从同一 Workspace 源资产读取事实，不维护独立数据库、聊天记录或完成 checklist。任何试图让 local app 承担对话、自动规划、Agent session 管理或专业执行的新能力，都必须单独证明它具有长期治理、跨 Agent 复用、确定性约束或可验证诊断价值；否则保留给 Agent。

## CLI 产品表面

Buildr 按用途和承诺区分三类产品表面：

| 分类 | 含义 | 可见性 |
|---|---|---|
| public | 普通用户或 Agent 可以正式依赖的 workspace onboarding、资产 lifecycle、诊断、修复和 runtime 操作 | 根帮助、主题帮助、主产品文档和 bootstrap canonical 示例 |
| legacy compatibility | 为旧调用或旧 workspace 保留的兼容解析、迁移、数据保留或 no-op | 仅在实际命中旧形式时输出 warning、info 或迁移提示；canonical 输出不推荐旧形式 |
| internal/maintenance | 产品构建、发布、自举、随包解析或 OpenSpec workflow 编排使用 | 在根帮助的明确分区、维护文档、workflow Skills 和产品验证中可发现 |

该分类是 help/docs 产品契约，不是权限或安全边界。maintenance/workflow 命令仍然可执行，也可以直接查看主题帮助；分类只说明普通 workspace 用户不应把它们当作日常资产 API。

当前 `package check/build` 属于产品 maintenance；OpenSpec 正常入口是 `converge` 与只读 `audit`，历史阶段命令只保留弃用兼容并受零消费者门禁约束。`package:<source-id>` 是 package manifest 与随包 Skill resolver 的内部 source identity，不是用户资产 id 或公开 source scheme。`service create --rules` 仅保留 deprecated warning compatibility no-op；canonical Service 规则入口是 Service 目录中的 `AGENTS.md`。

## Runtime 投射

Buildr 的原则是：

```text
Install to Buildr, render to Agent runtime.
```

Buildr 资产是源头；Agent runtime 是面向当前 Agent 的可重建入口。Workspace 就是 Buildr 治理的工作目录，也是 Skill 唯一 source authority；Project 是业务、依赖、适用性和 capability context，不是 Skill 安装隔离层。Skill 只在 workspace `skills/` 维护，再显式 render 到当前工作目录的 `workspace` destination 或个人的 `user` destination。Buildr 在写入前检查同名 identity、ownership、receipt 与完整目录 digest；冲突会阻止整次写入。

当前本地产品通过 `buildr app` 启动或复用只监听 loopback 的全局本机 Web 应用，并在默认浏览器中提供工作空间（Workspace）、项目（Project）、服务（Service）与变更（Change）管理视图。用户级登记列表只保存 Workspace root 和最近使用项；Workspace identity、metadata 与下属资源仍由各 Workspace 文件实时提供，不建立跨 Workspace 第二事实源。页面复用与 CLI 相同的应用用例：只允许修改 Workspace/Project 的 `name`、`description` 和 Service 的 `name`、`description`、`type`；source、path、identity 与 Git 状态保持只读。变更视图直接索引各 Project 的 `openspec/changes/` 与 `archive/`，用表格展示生命周期、任务进度和更新时间，并通过独立详情页按需读取 proposal、design、delta specs 与 tasks。

macOS `Buildr.app` 和 Windows launcher bundle 携带运行所需的 Node runtime 与相同 Web 资源，只负责启动或复用本机服务并打开默认浏览器，不引入 Desktop WebView。关闭浏览器不等于退出服务；页面提供受 session 保护的显式退出操作。当前不提供菜单栏、登录启动、磁盘自动扫描或跨 Workspace 资源聚合，也不由 App 启动或管理 Agent。

新建 Workspace、Project、Service 或 Change，以及继续、审查 Change，均只生成交给 Agent 的完整 prompt，不绕过 Agent 对范围、目录、Git、授权、OpenSpec 契约和 runtime 的判断。已归档 Change 默认只读，页面不会直接创建、编辑、apply、sync 或 archive Change。文件系统仍是本地 Workspace 的事实载体。

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
- 任务代码隔离统一使用当前 workspace 根 `.worktrees/<task-id>`；Agent 在采用 OpenSpec 或创建/复用 task worktree 前，先说明 change、路径、分支和当前动作。新 checkout 通过 `buildr worktree create` 创建，由产品确定性运行 doctor，并只在 clean、identity 未变化且全部 actionable findings 仅为当前 Agent runtime stale 时自动 sync；其他问题 fail closed 并保留现场。复用既有 checkout 不重复 bootstrap。
- 复杂、长期、跨批次或存在交叉依赖的任务可以由 `task-board` Skill 在 retained Workspace checkout 的 Project `openspec/knowledge/task-boards/yyyy-MM-dd-<task-id>.html` 维护稳定的只读 HTML 任务看板。看板以 Project task identity 为主，覆盖整个任务并按实际情况关联零个或多个真实 OpenSpec changes；关联 task environments 只提供事实来源，不创建、复制、更新或持有看板。从 task environment 维护时，Agent 通过 environment-bound `buildr worktree context` 确定性消费 `workspaceRoot`，不解析 receipt、扫描路径或要求重复输入 Workspace identity。看板以可独立交付批次和依赖池组织进度；首页优先用普通语言展示目标、当前结论、当前批次、下一步和阻塞，change 关联、业务/技术方案与已完成技术细节逐层后置。用户通过 Agent 对话参与，Agent 核实事实后单向更新页面并在关键进展回复中提供入口。旧称“任务驾驶舱”继续路由到该 Skill，但既有 `task-cockpits/` HTML 保持原路径和原内容。
- 实现型 OpenSpec change 在 propose 前完成 worktree 决策；采用 worktree 后，artifacts、实现和合并前候选验证不得双写到主工作区。
- `task-verification` 是 `buildr.task-verification/v2` 的默认 provider。对外只表达两种正式保证：普通开发和普通收尾使用“受影响验证（affected）”，发布、高风险或明确完整验证使用“完整候选验证（candidate）”；`minimal` 只作为实现循环内的快速反馈。Project 可以通过可选 `verification.yml` 声明测试能力、成熟度、适用阶段、覆盖、环境、副作用、授权和门禁；没有声明时继续读取 AGENTS、项目文档和已有入口。provider 根据任务上下文与政策返回 `requiredAssurance` 并选择最低充分能力，Task Finish 只消费匹配 evidence，不自行选择测试。实现内容变化后重跑同一 required assurance，不机械升级为 Candidate。operation 仍分为 `inspect`、`execute` 和 `cleanup`，只有 `execute` 启动验证命令。
- 有有效 `verification.yml` 时，checkout 或 npm 安装后的 `buildr verification run` 提供正式产品 executor：它按声明 DAG 并发运行能力，以 task/environment/run/token 绑定的 Git common-dir lease 协调跨任务共享容量，并返回 `buildr.verification-run/v1` 候选 evidence。Buildr 只执行调用方启动的 run，不创建或调度 Agent 任务；Task Finish 可核对同一 evidence，候选或 policy 变化后才重新执行。
- 测试能力只按边界分三类：快速检查覆盖单模块逻辑与静态/contract 约束；Integration 覆盖多个模块、CLI/API/文件系统或浏览器协作，其中 Browser 是可独立选择的 integration subtype；产品候选验证覆盖完整交付、打包、发布与系统级门禁。命令只是执行这些能力的入口，不再作为另一套概念。
- `task-worktree` 通过 `buildr.task-worktree-lifecycle/v1` 管理 task checkout placement、确定性创建后环境 bootstrap、retention、cleanup、入口迁移和 `treeChanged` 证据；Agent 仍负责任务理解与 branch/start point 决策。它不拥有验证命令选择、保证级别或验证报告政策。验证可以在有 worktree、当前分支或非 Git 候选中独立发生。
- Buildr 产品完整验证绑定最终候选 Git tree；commit、相同 tree 集成、push 和 worktree 清理不触发主开发分支重复 E2E，tree 改变后才在集成前重验受影响部分。
- `task-finish` 是 `buildr.task-finish/v1` 的薄入口。receipt-bound task environment 中，产品通过单一 `task finish run --project <code> [--change <id>]` 以 task 为主身份区分 Change/code-only 候选，并固定执行 `preflight → prepare → verify → deliver → cleanup`；code-only 明确跳过 Change/OpenSpec 专属动作，其余冻结、Node identity、required assurance、target fencing、retained convergence 与 cleanup 保证一致。产品缺陷、语义冲突和验证失败退出收尾并回到研发流程；Agent 不提交 caller-authored 协议。retained metadata-only 不进入 dirty tree 产品 executor，只在精确任务 paths、验证 identity 与目标 ref 可证明时由 Skill 交接 optional selected Git 单项 provider并保留无关改动。客户端只公开 `run|inspect`，不提供旧 action 或兼容执行器。
- `task-asset-review` 是 optional `buildr.task-asset-review/v3` provider。非简单 Workspace 任务从探索、设计、诊断、实现或验证阶段开始后，Agent 按高信息量节点把精炼信号写入 canonical Workspace 的 untracked `.buildr/asset-review/inbox/`；主 checkout 与 linked task worktree 共享同一 inbox，但不同物理 checkout 不通过用户级状态合并，每个任务拥有独立 observation 文件。provider 自己完成资格审查、覆盖核验和 Rule、Skill、capability Contract、product follow-up 分类；没有候选时直接 discard，Task Finish 只触发 finalize 并等待人工 accept/reject，不拥有门禁。accept 必须进入 identity 不同的新 task-triage，完成时按 outcome 核验维护记录与 Git 集成、OpenSpec artifact 或 no-change 结论证据。只有新任务实际修改前三类资产时才随修改提交 `asset-maintenance/<type>/<asset-id>/records/` 历史；product follow-up 由 OpenSpec 吸收来源。该能力不保存完整对话或轨迹，不引入公共 CLI、Hook、daemon、watcher、数据库、复杂锁或 `asset.yml`。
- “收尾”只授权可安全确定的常规动作，不授权 force push、merge commit、远端任务分支删除、丢弃改动、共享分支历史改写或语义冲突决策。
- 实际自举 workspace 的 sync 是独立状态变更，执行后按 Buildr Core 运行 doctor，不作为相同 tree 的第二轮产品验证；`buildr update` 只更新 CLI 来源。
- 其他 Agent 在存在 adapter 前，不使用 supported fallback adapter；Agent 应读取标准资产或 bootstrap guide 理解边界，并联系 Buildr 作者反馈 adapter 需求。

## MVP 边界

Buildr 当前 MVP 已验证文件系统、Git、CLI、Buildr Skill、bootstrap guide 和 Agent runtime 渲染可以支撑人和 Agent 共同维护工作资产。

当前事实以 [Buildr current knowledge](../openspec/knowledge/overview.md) 为准；规范性行为以 [OpenSpec specs](../openspec/specs/) 为准。

MVP 不解决完整企业云服务、权限系统、托管 Web/SaaS、多用户协作、代码托管平台集成、跨机器自动恢复、系统级 hook 或所有 Agent adapter。

OpenSpec Component 还包含 Buildr 自有的契约门禁 sidebar：它在 Requirement 粒度记录 change 基线、检测 active change 冲突和陈旧 delta，并在同步前后验证结果；OpenSpec CLI 与上游 workflow Skills 仍可独立升级。

Sidebar 是 Buildr 对外部能力的独立、可卸载增强模式；Skill Contribution 是其通用组合机制。fragment 作为 Component member 参与 integrity 和统一生命周期：Buildr 自有 Skill 可使用稳定 slot，外部 Skill 使用 prepend/append boundary composition。runtime source assembly 先验证 Component 全部成员，通过后才由纯上游正文与 sidebar fragments 生成 Agent runtime 派生 Skill，不回写 workspace Skill 源。它不是 Adapter 扩展、可执行 Hook、事件总线或任意脚本机制。

Buildr 的数据完整性保护是不可卸载的 CLI core：资产 identity、scope path、ownership、符号链接、保护根和集合根在写入前统一校验；跨文件 source mutation 使用 workspace 单写者 transaction、atomic writer、staging、backup 和失败回滚。进程异常留下的 transaction 会阻塞后续 source mutation，并由 doctor 提供恢复入口。该能力不是权限系统，也不阻止用户或外部工具直接编辑文件。

产品维护命令 `package build --out` 将输出视为带版本化 receipt 和 integrity 的生成树；只替换仍匹配上次 receipt 的输出，不删除非空无 receipt 或已被修改的目录。

当前 Components 不包含 Project/Service scope、远程 registry、依赖求解、权限系统或可执行 Hook。

## Roadmap

本节只概括后续产品方向。详细设计候选见 [Roadmap 资料](roadmap/)；这些资料不是当前产品事实、可执行资产或已经批准的实施契约。当前实现以 [Buildr current knowledge](../openspec/knowledge/overview.md) 为准，规范性行为以 [OpenSpec specs](../openspec/specs/) 为准；具体方向进入实现前仍需创建独立 OpenSpec change。

后续产品方向包括：

- 以[Agent 时代的工作基础设施](roadmap/agent-work-infrastructure.md)明确长期产品边界：Agent 负责理解任务、选择 Workspace 与资产、形成上下文、自行编排和专业执行；Buildr Application Core 提供 Enterprise、多 Workspace、外部数据源、长期工作资产与可接续共享状态。飞书、Agent 原生界面和 Buildr 界面具有不同的用户价值，彼此的接入与会话承载方式仍待验证；ACP 是未来可研究的 Agent 接入协议，不是上下文编排器。
- 正式 npm registry、release tag 和更多安装渠道；开发 checkout 与本地 tarball路径已经具备 Agent onboarding smoke test。
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
