# Buildr Product 术语表

本表维护 Buildr Product 的 canonical terminology。规范行为仍以 OpenSpec specs 为准。

## 紧凑终端摘要（Compact Terminal Summary）

- 定义：从长流程既有专业authority投影的有界、closed、只读JSON摘要，表达operation、running或terminal truth、关键阶段、primary failure、cleanup、展示边界与唯一结构化recovery pointer。
- 适用范围：release transaction与Buildr self-bootstrap等长流程的缺省stdout；完整专业Result仍由各自Result、hosted/output evidence或Finish maintenance持有。
- 避免混用：不是新的workflow Result、进度事件流或重试许可；stdout丢失、客户端断连、等待超时与`output.truncated`都必须先回读同一owner，不能推断失败或启动替代run。
- 来源：canonical `openspec/specs/long-running-workflow-observability/spec.md`（本 Change convergence 时建立）。

## 硬门禁（Hard Gate）

- 定义：仅当继续一个具体动作会破坏真实结果不变量时返回的 `blocked` 分类，例如越权、写错对象、未经授权或不可逆副作用、覆盖他人工作、证据失真或完成误报。
- 适用范围：产品设计、Application Result、Skill contract 与迁移审查；每项硬门禁必须明确 action、consumer、invariant、harm、authority、scope、fallback 与 classification。
- 避免混用：不是推荐流程、工具偏好、内部登记完整性、聚合健康或 Agent 的全局工作许可；无法说明具体 harm 的规则不是硬门禁。
- 来源：canonical `openspec/specs/governance-gate-taxonomy/spec.md`（本 Change convergence 时建立）。

## 待处理（Attention）

- 定义：当前结果或可独立核验事实仍成立，但存在需要单独恢复、补登记或跟进的问题。
- 适用范围：Delivery 后的 Activation/cleanup/diagnostics、内部 receipt/provenance 恢复，以及不撤销已成立专业事实的局部缺口。
- 避免混用：不是 Hard Gate、失败掩盖或 claimed success；若继续当前动作会造成真实不变量损害，必须 blocked。
- 来源：canonical `openspec/specs/governance-gate-taxonomy/spec.md`（本 Change convergence 时建立）。

## 建议（Advice）

- 定义：改善效率、质量或体验的推荐，不构成动作许可，也不否定当前事实。
- 适用范围：optional capability、推荐工具与非强制工作方式。
- 避免混用：不是 Attention 或 Hard Gate；不能承载必须恢复的问题，也不能替代授权和验证。
- 来源：canonical `openspec/specs/governance-gate-taxonomy/spec.md`（本 Change convergence 时建立）。

## 动作局部就绪（Action-local Readiness）

- 定义：`ready|required|blocked` 对一个具体 consumer 的具体 action 是否具备必要事实的判断。
- 适用范围：Task Entry、Environment、Verification、Finish、capability routing 与其他专业 Application 的局部入口。
- 避免混用：不是第四种治理级别，不是 Workspace、Task 或 Agent 的全局许可；局部缺口不得阻止不消费该事实或能力的动作。
- 来源：canonical `openspec/specs/governance-gate-taxonomy/spec.md`（本 Change convergence 时建立）。

## CLI 产品表面（CLI Product Surface）

- 定义：Buildr 对每个 CLI command 的可发现性与兼容承诺分类，封闭取值为 `primary`、`agent-machine`、`maintenance`。
- 适用范围：command metadata、根/主题帮助、CLI Reference 和产品验证；`primary` 表示普通工作主路径，`agent-machine` 表示 Agent/Skill 的稳定机器接口，`maintenance` 表示产品维护或 workflow。已退役命令不通过 legacy 分类继续注册。
- 避免混用：不是权限、安全或 effects 分级；低频机器接口不等于 unsupported/internal，领域授权仍由具体 Application/Skill contract 决定。
- 来源：canonical `openspec/specs/cli-product-surface/spec.md`（本 Change convergence 时更新）。

## 工作信息空间（Work Information Space）

- 定义：所有潜在可用于工作的来源，包括 Workspace 文件、数据库、API、网页、聊天、机器状态、用户输入和工具结果。
- 适用范围：描述 Agent 可能发现信息的全集。
- 避免混用：不等于 Buildr Workspace，不等于 Buildr 管理范围，也不等于 Context Window。
- 来源：[智能体优先（Agent-first）产品定位规范](../specs/agent-first-product-positioning/spec.md)

## Workspace

- 定义：Buildr 的工作范围、治理根和发现入口，可以包含代码、文档、临时文件、依赖、本机配置及受治理资产。
- 适用范围：Buildr root 与其中的 Project/Service 工作范围。
- 避免混用：内容位于 Workspace 不表示它已经被 Buildr 治理。
- 来源：[Workspace current facts](overview.md)

## 受管根（Managed Root）

- 定义：由 Workspace 布局和 registry 关系确定、由 Buildr 在既有 writer authority 内维护的 Project 或 Service source root；v2 source 未声明 `root` 时默认采用该语义。
- 适用范围：Project 的 `projects/<code>` 与实际 Project root 下 Service 的 `services/<code>`，以及明确要求 Workspace ownership 的 mutation。
- 避免混用：不是所有 Workspace 内目录的自动所有权声明，也不表示任意 consumer 可以绕过 identity、path、integrity 或安全删除边界。
- 来源：[Workspace source and local diagnostics specification](../specs/workspace-source-and-local-diagnostics/spec.md)

## 附接根（Attached Root）

- 定义：Project/Service registry 以 `root: attached` 显式登记的机器局部绝对 Git top-level；Buildr 只拥有 registry relation，不因登记取得外部 repository 的内容所有权。
- 适用范围：复用 Workspace 外已有独立 Git Project/Service，并由统一 source resolver 提供实际位置、ownership 与 Git identity。
- 避免混用：不是 clone、copy、move、checkout、adopt、repair 或 delete；不可访问或 identity 漂移只影响消费该来源的 action，不建立 Workspace 全局阻断。
- 来源：[Workspace source and local diagnostics specification](../specs/workspace-source-and-local-diagnostics/spec.md)

## Workspace Local Data Store

- 定义：Buildr Local在一个canonical Workspace中维护的全部单机local-only数据范围；当前包含Workspace Structured Store，也可包含明确声明为本机事实的其他存储。
- 适用范围：不应进入Git、runtime投射或跨机器同步的Workspace本地数据。
- 避免混用：不是单个数据库文件，不等于portable工作资产；未来Buildr Server/Cloud的共享authority不属于本地数据存储。
- 来源：[技术架构](architecture/technical.md)

## Workspace File Store

- 定义：Workspace中以文件和目录承载的portable或writer-owned事实，包括manifests、Rules、Skills、Specs及专业Task records。
- 适用范围：需要文件发现、审阅、Git版本化或独立writer ownership的工作资产与记录。
- 避免混用：不是Workspace内所有文件的统称，也不包含local-only SQLite structured data，以及被 Git 忽略的本机每日演进 YAML。
- 来源：[技术架构](architecture/technical.md)

## Workspace Structured Store

- 定义：Buildr Local为每个canonical Workspace维护的独立SQLite，用于索引、关系、聚合和事务特征明显的结构化数据。
- 适用范围：`.buildr/local/workspace.sqlite`及其版本化SQL migration lifecycle；Task Record是首个consumer。
- 避免混用：不是同步数据库、portable asset或组织协作authority；不得把SQLite文件上传或复制为Buildr Server/Cloud协议。项目每日演进不进入该库。
- 来源：[技术架构](architecture/technical.md)

## 工作资产（Work Asset）

- 定义：被明确组织、登记或纳入治理、可长期维护和复用的工作事实或工作方法来源。
- 适用范围：例如受管 Rules、Skills、Commands、Specs、Project/Service facts 和协作流程；示例不是封闭枚举。
- 避免混用：普通 Workspace 文件、临时内容或一次查询结果不会仅因可见或被使用而自动成为 Work Asset。
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)

## 智能体软件（Agentic Software）

- 定义：引入智能体参与理解用户目标、判断或执行工作并交付产品结果的软件；从局部能力开始引入即可逐步演进。
- 适用范围：智能体参与产品交付的功能及其协作方式，不要求所有功能同时改造。
- 避免混用：仅使用智能体开发代码，不自动使被开发产品成为智能体软件；原有业务、安全和授权边界继续有效。
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)、[随包原则](../../services/buildr/resources/workspace/AGENTS.md)

## 产物（Artifact）

- 定义：工作过程中形成或改变、可供查看和接续的中间成果或最终结果，包括文档、代码、Git 变更、数据记录与外部系统中的实际结果。
- 适用范围：多入口协作中的共同工作对象，以对应系统的身份、当前版本与可核验事实为准；并不限定为构建生成的文件。
- 避免混用：成果不因被生成或使用而自动成为工作资产（Work Asset），也不意味着新建统一产物存储；多入口事实一致不等于目标已经验收完成。正式发布制品仍使用各自限定术语。
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)、[设计技能](../../services/buildr/resources/workspace/skills/buildr/agent-first-design/SKILL.md)

## 共享工作环境（Shared Work Environment）

- 定义：Buildr 将 Work Assets、发现入口和 runtime 投射组织后，为 Agent 提供的整体工作体验。
- 适用范围：Agent 在 Workspace 中发现事实、规则、能力和流程的环境基础。
- 避免混用：不是另一个 Agent，不直接替 Agent 形成完整 Task Context。
- 来源：[产品架构](architecture/product.md)

## 上下文（Context）

- 定义：上下文是一个泛指概念，用于把与某个对象、范围或目标相关的信息放在一起讨论、发现和使用。
- 适用范围：工作空间上下文（Workspace Context）、项目上下文（Project Context）和服务上下文（Service Context）表示对应领域内全部已知、可访问或可能相关的信息；其中既可以包含 Buildr 治理的工作资产，也可以包含普通文件、代码、依赖、本机状态和外部来源。
- 避免混用：上下文不是固定存储结构，不等于已经加载到模型请求中的内容，也不表示其中全部信息都由 Buildr 治理。
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)

## 任务上下文（Task Context）

- 定义：智能体（Agent）为完成具体任务（Task），从工作信息空间及适用的工作空间、项目和服务上下文中发现、检索、判断、选择、组织和压缩后形成的语义工作集。
- 适用范围：可以包含 Buildr 工作资产（Buildr Work Asset）、用户目标、数据库、应用接口（API）、网页结果、工具证据（Evidence）和任务中形成的决定。
- 避免混用：不等于某个领域的全部上下文，不等于原始检索结果集合，也不等于某一次模型请求实际携带的全部内容。
- 来源：[规范变更系统（OpenSpec）变更生命周期](flows/openspec-change-lifecycle.md)

## 请求上下文（Request Context）

- 定义：智能体（Agent）针对某一次模型请求，从当前任务上下文中选取并与系统指令、对话历史等必要输入共同提交给模型的实际内容。
- 适用范围：同一任务可以发起多次请求，每次请求根据当前步骤携带不同内容；简单语法修复可能只需要目标文件和错误信息，跨多个服务的功能开发可能需要同时携带相关项目、服务、规范、代码和验证信息。
- 避免混用：不是任务上下文的完整副本，也不是上下文窗口本身；它是实际装入该窗口的内容。
- 来源：[Buildr 产品（Buildr Product）](../../docs/buildr-product.md)

## 上下文窗口（Context Window）

- 定义：模型单次请求可以承载的有限输入容量和技术容器；请求上下文是实际装入其中的内容。
- 适用范围：限制一次模型调用能够同时处理的信息量；长期任务可以跨越多个上下文窗口和多次请求。
- 避免混用：不是泛指的上下文、任务上下文或请求上下文本身，也不是持久工作资产。
- 来源：[智能体优先（Agent-first）产品定位规范](../specs/agent-first-product-positioning/spec.md)

## 词元（Token）

- 定义：人工智能模型处理文本时使用的基本单位；一个词元可以是一个字、词的一部分、标点或其他文本片段。
- 适用范围：描述模型输入、输出、上下文窗口容量、使用量和成本。
- 避免混用：不是登录凭证、访问凭证或恢复凭证等安全令牌；安全领域继续使用“令牌（Token）”。
- 来源：[Buildr 产品（Buildr Product）](../../docs/buildr-product.md)

## Project

- 定义：Workspace 内承载业务事实、OpenSpec planning、capability/applicability context 和 Service 关系的业务与依赖节点。
- 适用范围：`projects/<project>/` 及 `projects/manifest.yml` 登记实体。
- 避免混用：Project 不是独立 Workspace，也不保存 Agent runtime Skill 副本作为 authority。
- 来源：[Product current facts](overview.md)


### Buildr Web

- 定义：Buildr 通过默认浏览器提供的本机 Web 界面与能力；canonical CLI 入口为 `buildr web`。
- 适用范围：用户可见界面、CLI 产品表面、文档、Launcher 与诊断建议。
- 避免混用：不是桌面应用，不是独立远程服务，不拥有第二套数据或业务 writer。
- 来源：canonical `openspec/specs/buildr-web-workspace-application/spec.md`、`openspec/specs/buildr-web-browser-verification/spec.md` 与 `openspec/specs/cli-product-surface/spec.md`。

### 界面原型（UI Prototype）

- 定义：Agent 在用户对当前任务明确确认需要后，先调查现有真实界面，再以一个或多个使用模拟数据与本地交互的自包含 HTML 呈现本次提案实施后的完整页面；用户未明确要求忽略时，后续 Agent 默认按原型的信息架构、布局和交互开发。
- 适用范围：前端 UI 可能变化的 Task、Task 关联 OpenSpec Change、设计对齐，以及正式前端开发前的实施输入；Buildr Web 只读发现、列出并隔离展示带 `buildr:ui-prototype` 标记的多个页面。
- 避免混用：不是正式设计稿、canonical spec、像素级验收标准或Verification evidence；也不等于在真实前端工程中验证产品与技术方案的编码式原型。需要成为正式行为的选择仍进入design、delta specs、Brief与tasks。
- 来源：canonical `openspec/specs/ui-prototype/spec.md`。

### Buildr Web Frontend Service

- 定义：Product 下 `projects/product/services/buildr-web` Service 的正式名称，拥有 React/Vite 前端源码、依赖与正式构建。
- 适用范围：前端工程边界、Service registry 和构建交接；产物由 `buildr` Service 消费到内部 `web-dist`。
- 避免混用：不托管生产 HTTP，不拥有 session、SQLite 或 Application authority。
- 来源：[Buildr Web Frontend Service](services/buildr-web.md)。

### Buildr Web Runtime

- 定义：`buildr` Service 中按需启动的 loopback HTTP 运行时，负责 session、Origin 安全、同源 `web-dist` 托管与 Application 调用。
- 适用范围：`buildr web`、Launcher 和生产 browser smoke 的运行边界。
- 避免混用：不是 Frontend Service，不是常驻后台服务，不绕过现有 Application writer 边界。
- 来源：[Buildr Service](services/buildr.md) 与 [技术架构](architecture/technical.md)。

### Buildr Web Launcher

- 定义：启动 `buildr web` 并打开默认浏览器的平台图形入口；正式显示名为 Buildr Web，开发入口为 Buildr Web Dev。
- 适用范围：正式npm用户显式运行`buildr web launcher install|status|repair|uninstall`后生成的macOS `.app`或Windows Start Menu shortcut；它精确绑定Host Node、npm package entry、prefix和installation identity并执行`web`。checkout-backed入口另名Buildr Web Dev。
- 避免混用：它不是 Buildr Web，不是独立产品安装或更新渠道，不复制Node/Buildr，也不取得 Workspace 数据所有权。
- 来源：canonical `openspec/specs/buildr-web-workspace-application/spec.md`与`openspec/specs/npm-cli-package/spec.md`。

### 平台启动入口集成（Platform Launcher Integration）

- 定义：通过macOS `.app` / LaunchServices或Windows shortcut验证已安装Launcher能被操作系统入口唤起的显式专项测试。
- 适用范围：对应操作系统runner或维护者显式调用；使用隔离Root、no-open与no-notify。
- 避免混用：不是浏览器使用测试（Browser Use Test），不进入默认affected/full/Candidate，不验证页面DOM交互。
- 来源：[Buildr Service](services/buildr.md)。

### 浏览器使用测试（Browser Use Test）

- 定义：通过受控浏览器验证Buildr Web页面、DOM交互与用户路径的测试。
- 适用范围：Browser smoke与changed selector选中的前端验证；可在无界面模式（Headless Mode）中运行。
- 避免混用：不是平台启动入口集成（Platform Launcher Integration），不以打开默认浏览器或真实用户标签页作为验证手段。
- 来源：[Buildr Service](services/buildr.md)。

### 无界面模式（Headless Mode）

- 定义：自动化运行不显示默认浏览器、平台GUI或系统通知的执行模式。
- 适用范围：普通affected/full/Candidate、release smoke与可无头执行的Browser smoke。
- 避免混用：不表示没有HTTP server、loopback端口或owned子进程；仍必须使用隔离Root并精确清理owned资源。
- 来源：[Buildr Service](services/buildr.md)。

### Buildr Desktop

- 定义：为未来真正的桌面应用保留的产品术语；当前尚未实现。
- 适用范围：只用于说明保留边界；当前不是 CLI command、help topic、Launcher 名称或运行时产品。
- 避免混用：不得用于指称 Buildr Web 或 Buildr Web Launcher，也不为桌面应用建立当前 alias 或 legacy surface。
- 来源：canonical `openspec/specs/cli-product-surface/spec.md` 与 `openspec/specs/buildr-web-workspace-application/spec.md`。

## Service

- 定义：Project 下具有明确职责、代码或资产边界的服务节点，由 Project Service registry 登记。
- 适用范围：`projects/<project>/services/<service>/` 或 registry 声明 source。
- 避免混用：Service repo 不是默认独立 Agent runtime 入口。
- 来源：[Buildr Service](services/buildr.md)

## Change

- 定义：OpenSpec 管理的一次可实施行为变更，包含 proposal、design、delta specs、tasks，并可带 Buildr Brief 与 workflow sidecars。
- 适用范围：Project `openspec/changes/` 的 active/archive lifecycle。
- 避免混用：Change archive 是历史与 provenance，不是 Project 当前事实源。
- 来源：[OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)

## OpenSpec 收敛（OpenSpec Convergence）

- 定义：把一个apply-ready Change的delta确定性应用到Canonical Specs、严格确认结果并归档Change的单一事务边界。
- 适用范围：`buildr openspec converge`写操作及其未终结时的恢复检查；Converge是唯一canonical writer。
- 避免混用：不是Formal Verification、Task Finish、Git交付或归档后的长期审计。
- 来源：[OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)

## OpenSpec语义就绪预检（OpenSpec Semantic Readiness Preflight）

- 定义：在apply-ready Change进入Planning Review前，只读复用正式convergence planner、active Change conflict scan与projected strict validation，判断当前delta能否对当前canonical形成唯一且strict有效的expected Project。
- 适用范围：`buildr openspec convergence preflight <change> --project <project> --target <task-execution-root>`；返回`ready|blocked`，并把active Change conflict、Scenario omission、rename/identity conflict与projected validation failure交给Agent处理。
- 避免混用：不是Planning Review、Converge dry-run、Convergence Inspect、写入授权或实现后验证；不写canonical、Receipt、archive或Task/Review事实。delta、canonical、active Changes或executable变化后旧ready陈旧，最终Converge始终按最新事实重新检查。
- 来源：[OpenSpec确定性同步规范](../specs/openspec-deterministic-sync/spec.md)

## OpenSpec 收敛执行（OpenSpec Converge）

- 定义：执行OpenSpec Convergence的公开maintenance动作，完成规划、投射strict validation、条件canonical写入、写后确认、archive与事务Receipt release。
- 适用范围：`buildr openspec converge <change> --project <project>`；正常成功返回`passed + archived`后直接进入Development后续阶段。
- 避免混用：不是只读检查；不会把Receipt变成长期交付物，也不属于Task Finish operation。
- 来源：[OpenSpec确定性同步规范](../specs/openspec-deterministic-sync/spec.md)

## OpenSpec 收敛检查（OpenSpec Convergence Inspect）

- 定义：对仍存在的未决Convergence transaction，只读比较Receipt中的before/expected与canonical actual的恢复诊断动作。
- 适用范围：`buildr openspec convergence inspect`；只有Converge中断、恢复不确定或终态释放失败且事务回执仍在时使用。
- 避免混用：不是`OpenSpec Audit`、正常验收或长期漂移检查；事务未开始或Change已归档时返回`not-applicable`。
- 来源：[OpenSpec确定性同步规范](../specs/openspec-deterministic-sync/spec.md)

## OpenSpec 收敛回执（OpenSpec Convergence Receipt）

- 定义：Converge在首次canonical mutation前写入active Change `.buildr/convergence-receipt.json`的事务期恢复材料，保存identity、before/expected内容与执行处置。
- 适用范围：同一Task执行位置中尚未终结的Converge重试和Convergence Inspect。
- 避免混用：不是Archived Change、Canonical Specs、Task Result、Git证据或history/event/audit store；正常archive后释放，不进入Delivery Carrier。
- 来源：[技术架构](architecture/technical.md)

## 正式任务（Formal Task）

- 定义：目标与持久交付意图已经对齐，并以稳定 Task ID 进入 Buildr 生命周期管理的任务。
- 适用范围：准备产生代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他可交付持久变化的工作。
- 避免混用：普通对话、只读探索、临时操作或 Agent runtime 中泛称的 task/thread 不会自动成为正式任务；Formal Task Record也不是普通编辑、构建或有界测试的通用工作许可。
- 来源：canonical `openspec/specs/task-record/spec.md`（本 Change convergence 时建立）。

## 任务记录（Task Record）

- 定义：正式任务在 canonical Workspace 中的最小顶层事实，保存 Task ID、标题、意图、scope、Change、顶层状态、终态摘要，以及可选本机复盘文档的摘要与决定状态。
- 适用范围：Workspace Structured Store中的closed v3 Task、直接父任务/子任务关系，以及create、inspect、update、activate、complete、abandon。
- 避免混用：父任务/子任务只表达协调层级。Task Record不保存复盘正文、处置说明、来源关系、环境、action item或其他专业事实。
- 来源：canonical `openspec/specs/task-record/spec.md`（本 Change convergence 时建立）。

## 项目每日演进（Project Daily Progress）

- 定义：按已登记 Project 保存的本机日历日工作摘要，权威是 canonical Workspace 根下被 Git 忽略的 YAML 文件 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。输入是当日 Git 提交与更改文件；日摘要回答新增、更新、删除与弊端。
- 适用范围：Agent 通过 agent-machine CLI `record` 覆盖写入当天 v2 文件；CLI、本机 HTTP 与 Buildr Web 只读 inspect/list；自己的提交可与本机已有 Task ID 做 0..N 关联。
- 避免混用：不是 Task Record、当前认知、Verification 或 Retrospective；不进 Task SQLite、Git、Content Target 或跨机器共享。产品读取路径不生成摘要、不扫描 Git、不读取 `user.email`、不内置 cron。
- 来源：canonical `openspec/specs/project-daily-progress/spec.md`（本 Change convergence 时更新）。

## 每日演进提交（Daily Progress Commit）

- 定义：写入每日演进文件的一条 Git 提交投影，包含 sha、subject、作者、`authorship`（self/other）以及可选 Task ID。
- 适用范围：v2 文件中的 0..N 条提交；自己的提交可关联多个 Task，同一 Task 可出现在多条自己的提交中。他人提交必须展示且 `taskIds` 必须为空。
- 避免混用：不是 Task、当前认知条目、Person registry、Agent identity、登录账号或权限主体。作者对比由 Agent 对照本机 `git config user.email` 完成，产品读取路径不执行该比较。
- 来源：canonical `openspec/specs/project-daily-progress/spec.md`（本 Change convergence 时更新）。

## 待办任务（Todo Task）

- 定义：已接受但尚未启动的 data-only Task Record。
- 适用范围：只存 Workspace SQLite；`open` 作为 todo + active 的派生查询。
- 避免混用：不是文件系统 Task、Git 基线、Environment、Change、提案、排期或执行计划。

## 任务收尾（Task Finish）

- 定义：智能体（Agent）依据技能（Skill）的方法和边界，组合已有工具完成本轮成果交付、已有任务结果登记及安全善后。
- 适用范围：工作空间（Workspace）启动的工作，有无正式任务、单仓与多独立仓库。
- 避免混用：不是固定五阶段执行器，不要求候选或交接。任务完成、远端交付、专项激活和环境清理分别表达真实结果。
- 来源：[任务收尾](flows/task-closeout.md)、[默认任务工作方式](../specs/agent-task-workflows/spec.md)。

## 交付核对（Delivery Check）

- 定义：Agent在交付后重新读取Git、文件、部署或外部系统，核对成果实际到达目标位置。
- 适用范围：提交、推送、PR、部署、配置、内容发布与其他真实业务交付。
- 避免混用：不是Buildr持久状态或Task完成的替代证明；每个系统仍拥有自己的权威事实。

## 任务记录技能（Task Record Skill，ID `task-manager`）

- 定义：`task-manager`只是随包技能（Skill）的现有稳定标识，不是独立应用或流程总管；它作为`buildr.task-record/v3`默认提供方，指导智能体（Agent）调用产品动作创建、读取和维护任务记录（Task Record）。
- 适用范围：用户明确管理正式 Task Record，或 `task-triage` 判断正式持久交付即将首次写入的时点。
- 避免混用：不是所有任务的dispatcher，不拥有任何专业阶段；Buildr Web是同一Application的人类客户端，不通过Skill写入。
- 来源：[Task Record capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-record/v3.md)

## 父任务 / 子任务（Parent Task / Child Task）

- 定义：父任务组织整体目标和独立成果；子任务表达其中可独立交付的目标、范围与结果。一个任务可以同时是父任务和上级的子任务。
- 适用范围：真实独立交付的协调，计划使用原文档或任务目标说明。
- 避免混用：不是智能体临时并行分工；子任务完成、总体验收与父任务完成授权相互独立。父任务必须取得明确用户授权才可完成。
- 来源：[父任务协调](flows/task-parent-coordination.md)

## 协调任务（Coordinating Task）

- 定义：通过直接父任务/子任务关系管理一个或多个独立子Task的普通Task。
- 适用范围：用Task本身承载整体意图，并通过直接Children拆分可独立交付的工作。
- 避免混用：不是独立Board Domain、总调度器或状态聚合器；其终态仍由人或Agent明确决定。
- 来源：[任务生命周期架构讨论稿](../../docs/roadmap/task-lifecycle-architecture.md)

## 统一任务环境（Task Environment）

- 当前定位：已退役的旧聚合模块。Buildr不再保存统一环境计划、回执、就绪状态、资源清单或总清理结论。
- 当前替代：Git工作树、项目准备、进程或预览资源、发布环境分别由各自真实所有者维护；智能体（Agent）按目标和现场选择是否使用。
- 避免混用：缺少统一任务环境不构成任务、编辑、构建、测试、审查、验证或交付的阻塞条件。
- 来源：[Task Environment specification](../specs/task-environments/spec.md)

## 项目环境准备声明（Project Environment Preparation Declaration）

- 定义：Project根可选`preparation.yml`中的长期环境准备事实，使用closed`buildr.project-environment-preparation/v1`声明Project-wide或Service-scoped Recipe。
- 适用范围：团队已知的依赖准备、代码生成、工具初始化等可重复入口；支持只有Project、没有Service的结构，也支持多个Service分别声明。
- 避免混用：不是Task Plan、Receipt、技术栈自动发现结果或状态store；已确认且不改变scope、适用性、requiredness、capability、外部效果、安全例外或authority的routine diff可由专业owner维护，其余长期语义变化仍需用户决定。
- 来源：[Project Environment Preparation Declaration specification](../specs/project-environment-preparation-declarations/spec.md)

## 项目声明接入（Project Declaration Intake）

- 定义：面向Project `preparation.yml`与`verification.yml`的无状态Agent编排入口，在注册、首次Task、入口变化、专业gap或显式请求时只读发现候选与差异。
- 适用范围：确认Project-only或多Service scope、汇总证据与外部诊断，把已确认且不改变长期适用性的diff分类为routine maintenance并交给声明owner；scope、适用性、requiredness、capability、外部效果、安全例外或authority变化则请求用户做精确决定。
- 避免混用：不是统一Declaration store/schema/writer、后台扫描器或Task结果；不管理`capabilities.yml`/`commands.yml`，也不以routine分类绕过证据冲突或真实业务决定。
- 来源：[Project Declaration Intake specification](../specs/project-declaration-intake/spec.md) 与 [Buildr 项目声明体系](../../docs/architecture/buildr-project-declaration-system.md)

## 环境准备配方（Environment Preparation Recipe）

- 定义：Preparation Declaration中的稳定可选单元，绑定一个Project或Service scope，并包含一个或多个明确、无shell、有输入输出身份的有序Step。
- 适用范围：Agent按Task scope组合多个Recipe，表达多Service或非Node技术栈的具体准备动作。
- 避免混用：不是package manager adapter、递归manifest扫描、Verification capability或跨Task共享输出；语言和工具差异由Project/Service wrapper与明确executable表达。
- 来源：[Project Environment Preparation Declaration specification](../specs/project-environment-preparation-declarations/spec.md)

## Git 操作约定（Git Operations）

- 定义：`buildr.git-operations/v1` 的 Skill-only 无状态能力，为 consumer 已选定的单次 Git Operation 提供授权、安全默认值、前后 identity 与最小 Result。能力名称使用复数 Git Operations；一次具体动作使用单数 Git Operation。
- 适用范围：直接用户或 Task Finish、Buildr 产品入口等 consumer 已明确 repository、operation、相关 ref、scope 与授权后的 commit、push、组合或其他单次动作。
- 避免混用：不是 Git 平台、命令教程、Task Finish 编排、Git worktree provider、Application、Receipt 或 transaction；不自行选择动作、目标、顺序、冲突语义或历史改写策略。
- 来源：[Git Operations capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/git-operations/v1.md)

## Git 工作树提供方（Git worktree provider）

- 定义：`buildr.git-worktree-provider/v1` 的窄 provider，只创建、检查和清理 Git checkout/branch，并保存 repository、HEAD、clean、registration 与 Git effects evidence。
- 适用范围：智能体或用户明确需要隔离Git checkout，或明确管理task worktree时。
- 避免混用：不判断统一就绪，不拥有Runtime/CLI/依赖、projection、动态资源、恢复或总cleanup。
- 来源：[Git worktree provider contract](../../services/buildr/resources/workspace/skills/contracts/buildr/git-worktree-provider/v1.md)

## 任务范围 Change 引用解析器（Task-scoped Change Reference Resolver）

- 定义：按canonical Workspace、Task ID和限定`{project, change}`从matching Task Worktree或retained Project安全解析Change的共享只读能力。
- 适用范围：Task Record 引用校验和 Task 详情中的关联 Change。
- 避免混用：不接受调用方路径，不扫描任意工作目录，也不改变全局retained-only Change索引。
- 来源：[Change asset indexing specification](../specs/change-asset-indexing/spec.md)

## 任务审查（Task Review）

- 定义：面向正式 Task 的单一专业审查能力，由一个语义 Skill 动态判断审阅范围并执行 Review，由一个确定性 Application 校验、记录和读取结果。
- 适用范围：方案审查与完成审查共用同一 capability、Result 模型和 writer；两种类型只是同一能力的不同目标语义。
- 避免混用：不等于任务验证、任务资产审查或通用Change review，也不编排生命周期门禁。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 审查结果（Review Result）

- 定义：绑定明确目标 identity 的轻量Workspace-local evidence，记录审查类型、执行方式、reviewed/uncovered、findings、结论和系统完成时间。
- 适用范围：Workspace SQLite中`planning|completion`两个可选current slots；同类型事务完整替换，不同类型互不覆盖。
- 避免混用：不是 Receipt、历史日志或状态机；不持久化 revision、current、applicability 或 digest，适用性由读取时目标比较派生。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 任务复盘（Task Retrospective）

- 定义：用户明确要求时，Agent面向terminal Task检查执行时间、词元消耗（Token Consumption）、重复尝试、人机协作和Buildr workflow/harness成本，并形成一份自由Markdown效率报告。
- 适用范围：正文只保存在被Git忽略的`.buildr/local/task-retrospectives/<task-id>.md`；Task Record可登记当前文档摘要与`pending-decision|decided`。Buildr Web从概览卡片按需只读展示。
- 避免混用：不是Task Review、Verification或Finish gate，不采集隐藏推理或完整轨迹，不自动写回Rule/Skill/产品资产，不自动创建后续Task。旧Task Asset Review数据不迁移，随本次本机数据升级直接删除。
- 来源：canonical `openspec/specs/task-retrospectives/spec.md`（本 Change converge 时建立）

`pending-decision`只表示当前本机文档等待用户决定是否行动；`decided`只表示用户已经决定，不表示改进已实施。后续工作使用普通Task，并在目标中按需说明来源。

## 项目测试（Project Testing）

- 定义：面向 Project / Service 的无状态专业指导，帮助 Agent 根据真实技术栈设计测试框架、开发测试并编排反馈；分别判断测试主要意图、执行边界，以及一次编排的成本约束、选择范围和验证目标。
- 适用范围：Development、Acceptance、Static Conformance、Delivery / Release 意图；Static、Unit、Component、Integration、System 边界；Quick 成本约束；focus、affected、full 范围；frozen Task Content / Task Delivery、Product Artifact Candidate与Published Release验证节点。
- 避免混用：不是Task Verification或测试平台，不创建Result、Receipt、Application或provider contract；证据边界、affected/full选择范围与验证对象/决策节点是三个正交问题；Quick只提供开发反馈，System不自动等于Acceptance，`focus`只用于诊断选择；此处Component表示组件测试边界，不是Buildr受管资产Component。
- 来源：canonical `openspec/specs/project-testing-guidance/spec.md`（本 Change converge 时建立）

## 验证控制面（Verification Control Plane）

- 定义：Buildr Product测试中由ownership、registry、planner、DAG scheduler与executor组成的test-only编排层，负责affected owner选择、执行图、预算准入、依赖、资源需求与exact grant。
- 适用范围：`test:changed`、`test:focus`、`test:daily-full`、兼容`test:core`、`test:candidate`及Candidate CI对同一registry的执行投影。
- 避免混用：不是Task Verification、`verification.yml`通用能力schema、Product runtime scheduler或Task lifecycle authority；不拥有测试fixture内容。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试执行面（Test Execution Plane）

- 定义：验证控制面选定step后，实际组装runner、Test Context、Worker Host、sandbox、进程和cleanup的执行机制；当前测试runner为`node:test`，Context生命周期由公共Node Test Context Runtime拥有。
- 适用范围：Buildr Product直接测试与registry execution；通过Context lifecycle、step timing和diagnostic输出transient evidence。
- 避免混用：不是生产Application runtime或Verification Result；Context Runtime也不替代assertion/discovery runner，更换Vitest等runner不会自动改变Context与资源语义。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## Node测试上下文运行时（Node Test Context Runtime）

- 定义：供Node.js测试注册Context definition、按配置与依赖identity缓存state、发放test lease，并管理scope、并发安全、reset、dirty/evict和destroy的runner-independent公共组件。
- 适用范围：`@buildr-ai/buildr/test-context`公共入口、直接`node:test`文件以及一个或多个持久Worker Host；未来其他runner只能通过adapter复用同一生命周期authority。
- 避免混用：不是Buildr生产Application Runtime、test runner、Verification Control Plane或全局共享可变环境；Context对象只在单个Host进程内共享。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试上下文定义（Test Context Definition）

- 定义：以稳定`id/version`声明scope、dependency、configuration identity、parallel safety及create/acquire/release/reset/inspect/destroy hooks的closed Context contract。
- 适用范围：Application/DI state、transaction、snapshot、immutable seed、sandbox或worker-owned service provider。
- 避免混用：不是test case、fixture数据、changed-path owner或资源grant；使用同名id但不同version会形成不同cache identity。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试上下文缓存身份（Test Context Cache Identity）

- 定义：由definition `id/version`、canonical configuration、source identity、dependency identities和所属scope identity共同派生的稳定SHA-256身份，用于决定一个Worker Host内的Context state能否复用。
- 适用范围：Context cache命中，以及配置或源码变化后的cache miss。
- 避免混用：不是Git tree identity或跨Host共享键；matching identity只允许复用，不能证明可变state当前无污染。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试上下文处置（Test Context Disposition）

- 定义：verification registry中每个step对Context采用方式的闭合判断，只取`context-runtime | hybrid | full-lifecycle`并带稳定reason code。
- 适用范围：说明owner完整使用公共Runtime、只复用前置状态，或因stateless/黄金生命周期边界不接入Context。
- 避免混用：不是测试profile、execution boundary或性能等级；`full-lifecycle`不自动表示Candidate-only，`hybrid`也不允许共享Git refs、SQLite多连接或可变Workspace。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试上下文污染（Dirty Test Context）

- 定义：test lease显式标记或provider检查确认一个缓存state无法安全reset到可复用状态；Runtime在active leases归还后将其evict并执行destroy。
- 适用范围：process global、property descriptor、database/filesystem marker或provider identity发生不可恢复漂移时的失败关闭与清理。
- 避免混用：不是普通cache miss或测试失败的同义词；unexpected污染必须使当前测试可见失败，不能静默重建后记录为passed。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试工作进程宿主（Test Worker Host）

- 定义：由Context-aware runner持久维护的Node进程，在`node:test` non-process isolation下连续执行一组文件并保留本进程的module与Context cache。
- 适用范围：多个Host并行、每Host文件顺序执行、Host数量受outer worker grant约束。
- 避免混用：不是单个test case、DAG step或跨进程共享内存；多个Host各自拥有matching Context state。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## Buildr测试上下文（Buildr Test Context）

- 定义：Buildr test-only provider以`<id>/vN`稳定key标识、在一次verification plan内最多prepare一次的只读测试基线；provider marker与完整tree identity共同证明其结构和未污染状态。
- 适用范围：昂贵且不是当前case主要待证事实的Workspace/领域前置环境跨runner复用；当前首个profile为`task-lifecycle/v1`。
- 避免混用：不是通用上下文（Context）、Task Context、共享可写Workspace、跨plan缓存或测试分类；使用Context不把Integration/System降为Component。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 测试沙箱租约（Test Sandbox Lease）

- 定义：Buildr Test Context Pool为一个worker/case从不可变seed物化的独立可写sandbox及其owner-bound幂等release责任；发放与释放前后检查containment、alias和seed identity。
- 适用范围：允许并发case复用同一只读Context，同时隔离filesystem、SQLite、Git或Workspace副作用并形成materialize/release timing。
- 避免混用：不是Execution Resource lease、Task checkout、Git worktree provider或共享Context本身；consumer只能删除自己拥有的sandbox，不能清理outer plan拥有的seed。
- 来源：[Buildr Product Verification Framework](../../services/buildr/docs/verification-framework.md)

## 项目测试地图（Project Testing Map）

- 定义：Project根`verification.yml`中由团队确认的现有测试能力族地图；只使用`buildr.project-verification/v4`，按测试族声明scope、purpose、source paths、test roots、完整入口、可选选择提示和资源要求，不登记每个测试文件。
- 适用范围：帮助Agent结合Task目标与当前改动，定位已有单元、功能、前端交互和环境冒烟测试。
- 避免混用：不是测试清单、执行计划、DAG、审批或测试框架；Application不根据地图替Agent选择和执行测试。
- 来源：[Task Verification capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-verification/v4.md)

## 任务验证（Task Verification）

- 定义：面向正式Task开发完成验证的专业能力。Agent读取Task、当前改动和项目测试地图，直接调用项目测试工具，并通过唯一Application保存或查询有意义的完成报告。
- 适用范围：记录内容版本、实际检查、选择范围、目标、结果、未覆盖项、结论和完成时间，并检查内容或测试地图是否变化。
- 避免混用：不替代Task Review或业务验收，不开发缺失测试，也不拥有统一推进决定或Task顶层状态。
- 来源：[Task Verification capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-verification/v4.md)

## 任务验证报告（Task Verification Report）

- 定义：Workspace SQLite中按Task ID唯一的`buildr.task-verification-report/v1` current row，绑定Task、内容版本和实际项目测试地图，记录Agent真实执行的检查、选择范围、目标、结果、未覆盖项、整体结论和完成时间。
- 适用范围：CLI、Skill和Buildr Web共用的current验证事实；读取时根据内容版本与测试地图identity派生`current / stale / unknown`。
- 避免混用：不是执行日志、测试计划、审批、历史清单或状态机；不保存完整输出、环境事实、风险决定、推进决定或Candidate生成权。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 当前认知结果（Current Knowledge Result）

- 定义：Current Knowledge provider针对一个Project当前tree返回的专业结果，包含status、影响、变更资产、未决项、来源身份与tree identity。
- 适用范围：OpenSpec创建、修订、实现、收敛以及无Change的长期知识维护。
- 避免混用：不是任务级推进决定；多Project任务逐Project解释，缺失或失败只影响实际依赖它的动作。
- 来源：[Current Knowledge Maintenance capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/current-knowledge-maintenance/v2.md)

## Parent Plan

- 当前定位：旧父子协调模式的历史概念，相关写入与固定流程已退役；既有内容保留只读。当前父任务协调见[说明](flows/task-parent-coordination.md)。

- 定义：已从旧父子协调模型一次迁入`tasks.legacy_parent_plan_json`的历史计划。
- 适用范围：父任务协调（Task Parent Coordination）只读展示，帮助人和Agent理解旧任务当时的计划。
- 避免混用：不是当前计划、Child状态、验收门禁或可写流程；不得迁回其他模块。
- 来源：[父子任务改造前梳理](../../docs/archive/2026-08-30-parent-child-task-audit.md)

## Product Artifact Candidate verification

- 定义：Project Testing针对exact source与唯一候选制品组织的验证目标/编排；Buildr Product由`test:candidate`及其GitHub分布式投影执行完整daily evidence并增加artifact、package、install与compatibility evidence。每个current release HEAD/tree只对应matching Product Artifact Candidate generation和唯一tarball。
- 适用范围：显式完整Project回归、冻结release source的发布候选门禁或用户要求的full validation。
- 避免混用：这是发布体系的产品候选，不是任务级开发状态；changed/affected开发反馈和daily-full都不等于完整Product Artifact Candidate。
- 来源：[Verification ownership](../../docs/verification-ownership.md)

## 发布集合（Release Collection）

- 定义：由维护者为一个精确package version从指定`dev` baseline创建的唯一`release-<version>`内容集合；后续只纳入维护者明确选择且带`-x` provenance的`dev` commit，不自动追随`dev`。没有`sourceDevCommit`的release-only内容只有在存在独立可验证dev回流证据时才可成立，current owner不支持时拒绝。
- 适用范围：release create/update/freeze/reopen/abandon/cleanup、不可变generation freeze history、Product Candidate source、release→main PR、protected Publication和发布后dev来源核验。
- 避免混用：不是release Task、Task worktree、npm dist-tag或GitHub Release；同名branch/ref只是载体，必须同时核验version、baseline、selection chain和HEAD/tree identity。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`。

## 发布选择链（Release Selection Chain）

- 定义：从release的精确`dev` baseline开始，按维护者授权顺序记录每个source dev commit、带`-x` provenance的result release commit、generation和不可变历史freeze identity的closed可验证链；无法重建source dev commit的entry为invalid。
- 适用范围：release更新审计、Candidate currentness、readiness、transaction context和失败恢复。
- 避免混用：不是通用Git history、聊天中的commit列表或caller-claimed success；冲突现场、未授权commit和普通`dev`前进不能被静默加入链。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`。

## 发布源身份（Release Source Identity）

- 定义：current release HEAD commit、Git tree和selection chain identity组成的冻结source；下游Product Candidate、tarball、main tree和transaction context必须精确绑定它。
- 适用范围：Candidate generation、artifact manifest/integrity、release→main tree equality、pre-tag readiness和publish evidence。
- 避免混用：不是近似branch name、最新`dev`、main commit identity或版本字符串；source任一部分变化都会使旧下游evidence stale。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`与`openspec/specs/product-verification-quality/spec.md`。

## 发布生命周期（Release Lifecycle）

- 定义：从current selection、Candidate、readiness、Publication、dev provenance reconciliation与closeout owner facts派生的version-scoped只读阶段模型；稳定recovery identity绑定version、唯一协调Task、selection generation/identity、frozen context与适用publish run。
- 适用范围：同一`release-<version>` Task从selection持续active到必需closeout完成、等待publication授权、发布后收敛恢复与最终no-change完成。
- 避免混用：不是Task Record新状态、旁路workflow store、聊天进度、support Task或publication授权；Candidate/readiness通过不等于lifecycle closed。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`与`openspec/specs/agent-task-workflows/spec.md`。

## 发布阶段时间线（Release Phase Timeline）

- 定义：从Task、Git/PR、GitHub run/attempt、release owner Result、Environment与Doctor的current时间事实派生的portable closed阶段投影；identity绑定规范化阶段数组，不写Task Record或旁路日志库。
- 适用范围：selection/freeze、Candidate attempts、release→main、readiness、publication授权、dispatch/Environment approval、Publication、dev reconciliation与closeout的耗时统计和恢复报告；等待分类只使用`machine-execution`、`platform-queue`、`environment-approval`、`human-decision`或`unknown`。
- 避免混用：不是release lifecycle状态权威、聊天时间线或估算器；缺少开始或结束边界时不得补造duration。
- 来源：canonical `openspec/specs/open-source-release-governance/spec.md`与`openspec/specs/release-collection-model/spec.md`。

## 发布后 dev 来源核验（Post-publication Dev Provenance Reconciliation）

- 定义：Publication成功后，对matching frozen release selection、正式release/main refs与current remote dev执行的只读幂等核验；证明baseline和全部ordered `sourceDevCommit`仍由current dev包含，不创建main→dev merge或任何dev写入。
- 适用范围：`release-git-convergence.mjs reconcile-dev`、release lifecycle的Publication后阶段与closeout前置。
- 避免混用：不是main→dev convergence、tree equality、branch merge policy、release branch回灌或Task Finish Delivery；通过只证明发布集合的dev来源与identity currentness。
- 来源：canonical `openspec/specs/open-source-release-governance/spec.md`与`openspec/specs/release-collection-model/spec.md`。

## 发布中间载体（Release Intermediate Carrier）

- 定义：Release Git owner按selection generation创建的确定性`codex/release-main-<version>-g<generation>` branch，用于承载冻结release source并作为唯一release→main PR head；main tree等价后属于必需closeout资源。
- 适用范围：generation隔离、受保护release→main PR、carrier identity/ownership核验和幂等删除。
- 避免混用：不是正式远端`release-<version>`发布事实、Delivery Carrier、release Task、tag或npm artifact；不得复用旧generation carrier，正式release ref默认保留并核验。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`与`openspec/specs/open-source-release-governance/spec.md`。

## 交付载体（Delivery Carrier）

- 定义：承载成果的commit、branch、PR、tarball、安装包或其他交付介质。
- 适用范围：Agent直接交付与发布系统。
- 避免混用：载体存在不等于目标已完成；必须回读目标系统的实际结果。

## 自举激活（Self-bootstrap Activation）

- 定义：Buildr自举Workspace取得matching Task delivery result后，由唯一`buildr-self-bootstrap-sync` runner执行的retained sync、开发入口检查与Doctor。
- 适用范围：Buildr自身交付后的本机产品收敛。
- 避免混用：不是Task Delivery或Task Record完成状态；失败只形成Activation attention，不撤销已交付成果。

## 方案审查（Planning Review）

- 定义：Task Review 对当前 Task Intent 与计划上下文执行的审查，Result绑定调用方实际审阅对象的稳定`subjectIdentity`。
- 适用范围：实现前方案检查；没有执行时 planning slot 可以不存在。
- 避免混用：不要求所有Task固定为OpenSpec artifacts；OpenSpec计划先通过Semantic Readiness Preflight。Planning Review不拥有、保存、复制或解释preflight检查。
- 来源：[Agent task workflow specification](../specs/agent-task-workflows/spec.md)

## 完成审查（Completion Review）

- 定义：Task Review 对实现、证据与 Task Intent 整体一致性的审查，Result必须绑定真实完成对象的稳定`subjectIdentity`。
- 适用范围：当前代码tree/commit、文件产物、部署结果或外部系统结果；没有执行时completion slot可以不存在。
- 避免混用：不生成完成对象，不替代Task Verification。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## Buildr 应用负载（Buildr Weblication Payload）

- 定义：一次构建形成的渠道无关、可摘要比较的公共应用内容，包括CLI、Core/Application、Buildr Web HTTP/runtime与正式静态资源、SQLite migrations、package baseline、生产依赖、许可证、版本和协议identity。
- 适用范围：npm package消费的`buildr.application-payload/v1` manifest及`applicationPayloadDigest`；同一payload内只携带生成Launcher所需图标，不携带已生成入口。
- 避免混用：不是npm tarball、已生成Launcher或Actions artifact；不包含Node、测试、源码映射、Vite toolchain或开发依赖。
- 来源：canonical `openspec/specs/buildr-application-payload/spec.md`。

## 产品 Node（Product Node）

- 定义：历史SEA/平台安装设计中随Buildr产品单元交付的官方Node.js runtime；当前npm-only产品不实现或分发Product Node。
- 适用范围：仅用于解释已归档Change与未来可能重新评估的自包含安装模型，不是当前runtime role。
- 避免混用：不是当前npm Host Node或development host Node；不得从历史设计推断当前支持SEA、PKG或MSI。

## 宿主 Node（Host Node）

- 定义：安装并启动`@buildr-ai/buildr` npm package的用户Node.js executable，必须满足package `engines.node`。
- 适用范围：npm渠道Buildr main process和同一runtime bundle。
- 避免混用：不随npm package交付，也不会因进入Workspace而切换runtime。

## 开发宿主 Node（Development Host Node）

- 定义：由Buildr Product `.node-version`精确锁定、用于启动checkout-backed Buildr CLI、Buildr Web Dev、Product准备与验证的Node.js executable。
- 适用范围：development channel main process、同一checkout中的product re-entry、声明的npm准备与self-bootstrap验证；当前精确版本为`24.15.0`。
- 避免混用：不是npm package消费者的Host Node，也不是Workspace通用runtime；兼容但非精确版本必须fail closed。

## 平台产品单元（Platform Product Unit）

- 定义：历史平台installer设计中的原子Buildr所有权边界；当前npm-only产品不实现平台产品单元。
- 适用范围：只用于已归档Change或未来企业/普通用户自包含安装的新Change。
- 避免混用：本机Buildr Web Launcher只是npm安装的图形投射，不是平台产品单元。

## 版本发布感知（Release Awareness）

- 定义：Buildr同时读取npm的`latest`和`next`，把GA正式版与RC候选版的当前发布头、可更新状态、提示与精确更新命令组合为统一的只读Application结果。
- 适用范围：`buildr update check`、Doctor非阻断提示、Buildr Web全局提示和Buildr Skill；真正更新只在用户明确选择后由CLI执行。
- 避免混用：不是自动更新器，不替用户选择版本，也不修改Workspace数据或Agent runtime。
- 来源：canonical `openspec/specs/buildr-cli-self-update/spec.md`、`openspec/specs/agent-readable-doctor/spec.md`与`openspec/specs/buildr-web-workspace-application/spec.md`。

## 发布轨道（Release Track）

- 定义：用户更新Buildr时选择的版本类别；`stable`对应npm `latest`和GA正式版，`candidate`对应npm `next`和RC候选版。
- 适用范围：双轨道版本检查、`buildr update --track stable|candidate`及Agent向用户说明选择。
- 避免混用：不是npm/development安装来源，不进入Workspace配置；默认轨道只保持现有安装语义，正式版不会自动切到候选版。
- 来源：canonical `openspec/specs/buildr-cli-self-update/spec.md`与`openspec/specs/npm-cli-package/spec.md`。

## 正式发布制品集合（Release Artifact Set）

- 定义：同一npm-only release contract和Application Payload identity下冻结的唯一npm tarball及其内部release-artifact evidence。
- 适用范围：npm tarball只发布到npm Registry；GitHub Release只保存版本说明并拒绝Buildr binary Assets。
- 避免混用：GitHub Actions artifact只是临时候选/evidence carrier，不是公开下载渠道；本机Launcher也不是公开制品。
- 来源：canonical `openspec/specs/open-source-release-governance/spec.md`与`openspec/specs/npm-cli-package/spec.md`。

## 受控同步（Controlled Sync）

- 定义：active Change 在当前会话成功取得 pre-sync receipt 后，由 Agent 按 delta 更新 canonical specs、再通过 post-sync guard 的同步阶段。
- 适用范围：OpenSpec Change 从实现进入归档前的 canonical spec 维护。
- 避免混用：不等于 apply 阶段预写 canonical specs，也不以 baseline adopt、重跑 pre-sync 或 `--skip-specs` 掩盖失败。
- 来源：[OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)

## 仅 runtime 投影变更（Runtime Projection-only Delta）

- 定义：已验证 implementation source 在保留 checkout 上执行 Buildr runtime sync 后，仅产生受管 runtime projection 与对应 receipt 的 delivery 差异。
- 适用范围：描述retained Workspace sync后可精确归因的runtime投影差异；是否需要重新验证由Agent根据实际内容和运行条件变化判断。
- 避免混用：lockfile、source、非受管 generated asset、手工修复或无法精确归因的 diff 都是 implementation-changed，不可复用原验证证据。
- 来源：[OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)

## Skill 投射所有权回执（Skill Projection Ownership Receipt）

- 定义：Buildr 为某个 destination、Agent adapter 与 runtime Skill path 保存的本机控制状态，用文件 inventory、identity 和 digest 证明 Buildr 对该次 Skill 投射的更新权与清理权。
- 适用范围：`.buildr/agent-runtime/<workspace|user>/<adapter>/skill-projection-ownership-receipts/`，以及 render、inventory、Doctor、Component/builtin lifecycle 的所有权判断。
- 避免混用：不是 Agent 消费的 Skill、源资产、执行证据或可提交到 Git 的 portable receipt；旧 `<runtime-root>/buildr/skill-projection-receipts/` 只是受控迁移输入，不是第二 authority。
- 来源：[Workspace-first runtime projection specification](../specs/workspace-first-runtime-projection/spec.md)

## 收尾与交付（Closeout and Delivery）

- 定义：日常协作中均可表示完成本轮工作后的结束动作，包括成果到位、已有任务登记、安全善后和遗留说明。
- 适用范围：有无 Buildr 任务、有无 Git 管理的工作。
- 避免混用：任务完成记录、真实交付、环境激活和资源清理分别成立；日常同义不代表这些事实相同，不自动授权发布或部署。
- 来源：`task-closeout-orchestration`、`agent-task-workflows` 与 `flows/task-closeout.md`。
