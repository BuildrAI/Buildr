# Buildr Product 术语表

本表维护 Buildr Product 的 canonical terminology。规范行为仍以 OpenSpec specs 为准。

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
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)

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

## 共享工作环境（Shared Work Environment）

- 定义：Buildr 将 Work Assets、发现入口和 runtime 投射组织后，为 Agent 提供的整体工作体验。
- 适用范围：Agent 在 Workspace 中发现事实、规则、能力和流程的环境基础。
- 避免混用：不是另一个 Agent，不直接替 Agent 形成完整 Task Context。
- 来源：[产品架构](architecture/product.md)

## 上下文（Context）

- 定义：特定工作范围中可供 Agent 发现、选择和使用的候选信息。
- 适用范围：Work Context、Workspace Context、Project Context、Service Context 都是 Context 的范围限定，不是 v1 并列核心模型。
- 避免混用：不等于已经加载的模型输入，也不表示其中全部信息由 Buildr 治理。
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)

## 任务上下文（Task Context）

- 定义：Agent 为完成具体 Task，从工作信息空间中发现、检索、判断、选择、组织和压缩后实际使用的语义工作集。
- 适用范围：可以包含 Buildr Work Assets、用户目标、数据库/API/网页结果、工具 evidence 和任务中形成的决定。
- 避免混用：不等于检索结果集合，也不等于一次模型调用的 Context Window。
- 来源：[OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)

## 上下文窗口（Context Window）

- 定义：某一次模型调用实际装入的有限、临时输入，是 Task Context 在某一时刻的有限投影，也可能包含系统指令和对话历史。
- 适用范围：模型单次推理的技术容量与实际输入。
- 避免混用：不是 Task Context 本身，不是持久工作资产；长期 Task 可以跨越多个 Context Windows。
- 来源：[Agent-first 产品定位规范](../specs/agent-first-product-positioning/spec.md)

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
- 避免混用：不是正式设计稿、canonical spec、像素级验收标准、Planning Identity 或 Verification evidence；也不等于在真实前端工程中验证产品与技术方案的编码式原型。需要成为正式行为的选择仍进入 design、delta specs、Brief 与 tasks。
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

## 验证准备闭包（Verification Preparation Closure）

- 定义：Formal Verification针对实际selected capabilities，将其声明identity、同Project Preparation Recipe要求、matching Environment Plan/Receipt与runtime invocation identity合并去重后形成的单层、closed执行前置集合。
- 适用范围：在打开Verification Execution Record、启动进程、Browser或外部资源之前的纯读admission；可恢复的Recipe缺口由Task Environment唯一writer幂等prepare。
- 避免混用：不是Task scope、Change applicability、Content Target、源码写入授权、测试DAG或通用工作许可；辅助Service准备不表示Task拥有该Service，无关开发、只读调查和明确非正式检查不被该门禁阻塞。
- 来源：[技术架构](architecture/technical.md)

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
- 适用范围：`buildr openspec convergence inspect`；只有Converge中断、恢复不确定或终态释放失败且Task Environment现场仍在时使用。
- 避免混用：不是`OpenSpec Audit`、正常验收或长期漂移检查；事务未开始或Change已归档时返回`not-applicable`，Environment cleanup后不得追索。
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

## 终态贡献交付对账（Terminal Contribution Delivery Reconciliation）

- 定义：当直接 Child 已 completed 且既有 immutable Development handoff 与 terminal Finish association 能证明真实交付，但原生 Contribution Handoff 因历史编排遗漏而缺失时，由 Task Development 追加的一次性、内容寻址恢复证据。
- 适用范围：Parent Coordination 对历史终态 Child 的 Contribution delivery 恢复；必须绑定 current Parent Plan、Parent/Child 关系、Candidate/generation、三个 gate、archived Change、完整 Contribution Handoff、reason 与 source。
- 避免混用：不是 normal Child 的常规 handoff、Task reopen、Parent Plan reconcile、Git 交付声明或通用审计日志；不能仅凭 completed、commit、文件或 canonical specs 建立。
- 来源：active Change `recover-terminal-child-contribution-delivery`，convergence 后由 canonical Parent/Child Coordination 与 Task Development specs 持有行为语义。

## 任务入口快照（Task Entry Snapshot）

- 定义：面向Agent启动或继续Formal Task的只读compact projection，组合Task Record、matching Task Environment execution projection与保存的Task Development applicability，并返回一个typed next及其action-local capability/provider identity；尚无Development时缺少Environment只形成recommended prepare。
- 适用范围：`buildr task next <task-id>`与`buildr.task-entry-snapshot/v1`；`required`表示不可安全绕过的authority/identity恢复前置，`recommended`表示用户可按实际情况调整的默认路径。
- 避免混用：不是任务上下文（Task Context）、Context Window、完整lifecycle DAG、Task Overview、Receipt/Result、writer或第二套状态机；不自动执行next，也不把耗时/调用指标变成gate。
- 来源：[Task Entry Snapshot specification](../specs/task-entry-snapshot/spec.md)

## 任务记录（Task Record）

- 定义：正式任务在 canonical Workspace 中的最小顶层事实，保存 Task ID、标题、意图、scope、Change、顶层状态、终态摘要与复盘来源 Task ID。
- 适用范围：Workspace Structured Store 中的 closed v2 Task、Parent/Children、复盘来源/后续关系，以及 create、inspect、update、activate、complete、abandon。
- 避免混用：Parent/Child 只表达协调层级；复盘来源只表达信源。Task Record 不保存 Environment、Development、复盘正文、action item 或其他专业事实。
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

## 任务事实（Task Fact）

- 定义：对Current Fact与Terminal Fact的产品说明总称。
- 适用范围：讨论Task当前专业状态或最终完成/放弃与交付结论时的分类表达。
- 避免混用：不是通用Domain、表或聚合store；事实仍由Task Record、Development、Environment、Review、Verification、Retrospective与Finish等专业authority分别持有。
- 来源：[Task execution artifacts specification](../specs/task-execution-artifacts/spec.md)

## 当前事实（Current Fact）

- 定义：某个专业Application对Task当前可恢复、可替换状态持有的事实。
- 适用范围：Development、Environment、Review、Verification与Retrospective current records等专业current authority。
- 避免混用：不是历史执行日志或终态快照；`task_lifecycle_current`已退役，不创建替代聚合表。
- 来源：[Task execution artifacts specification](../specs/task-execution-artifacts/spec.md)

## 终态事实（Terminal Fact）

- 定义：Task完成或放弃后需要长期证明最终结果的专业事实。
- 适用范围：Task Record terminal result与Finish completion等由专业authority长期持有的结论。
- 避免混用：不是一次执行的stdout/stderr或可按retention清理的执行记录。
- 来源：[Task execution artifacts specification](../specs/task-execution-artifacts/spec.md)

## 任务执行记录（Task Execution Record）

- 定义：一次Task专业执行发生了什么的有限期记录；SQLite保存closed metadata，受限Workspace-local目录保存已脱敏正文。
- 适用范围：v1的Verification execution与Finish diagnostics，以及固定quota、retention、resolution和cleanup状态。
- 避免混用：不是Current/Terminal Fact、执行资源、通用event/history payload或Consumer/Adoption关系；正式Task command Verification与每次真正执行的Finish invocation均已接producer，但各自专业current与恢复资源仍由原owner管理。
- 来源：[Task execution artifacts specification](../specs/task-execution-artifacts/spec.md)

## 执行资源（Execution Resource）

- 定义：执行中实际占用、需要恢复或清理的资源。
- 适用范围：Environment checkout、Delivery Carrier、worktree、target lease与verification ticket等由原专业owner管理的资源。
- 避免混用：不是Task Execution Record正文或统一资源表；Inventory只能组合owner提供的最小read model。
- 来源：[Task execution artifacts specification](../specs/task-execution-artifacts/spec.md)

## 证据（Evidence）

- 定义：某份专业事实或执行记录能够证明什么的语义角色。
- 适用范围：Review、Verification、Finish及其他consumer解释已有事实或记录的证明范围。
- 避免混用：Evidence不是独立存储类别，也不要求Consumer/Adoption表；authority仍属于被引用的专业事实或执行记录。
- 来源：[Task execution artifacts specification](../specs/task-execution-artifacts/spec.md)

## 任务收尾（Task Finish）

- 定义：消费current Development Handoff，提供可选五阶段自动交付、外部交付后的Delivery Reconciliation和交付结果投影的能力。
- 适用范围：Agent选择自动Finish、直接Git或PR后，Buildr验证逐repository Delivery，并独立呈现Activation、Environment Cleanup与Diagnostics。
- 避免混用：不是正式Task交付的唯一通道，不替Agent选择Git策略，也不因Buildr内部登记、Doctor、cleanup或diagnostics失败否定已确认Delivery。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 交付对账（Delivery Reconciliation）

- 定义：Agent通过Git、PR或其他已授权路径完成交付后，Buildr从current handoff、Task scope、registries、Git topology与真实remote target重建并登记逐repository Delivery evidence的只读核验动作；Environment可复用但不是唯一上下文来源。
- 适用范围：外部交付、自动Finish内部证明缺失、多repository部分交付续跑与Task terminal登记恢复。
- 避免混用：不接受claimed success、commit清单或调用方手写proof；不创建Delivery Carrier、不push，也不把路径不重叠当作语义安全。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 维护状态（Maintenance Status）

- 定义：Delivery之后对Activation、Environment Cleanup与Diagnostics分别记录的`passed | attention | not-applicable`等正交状态。
- 适用范围：Task已交付但自举、Doctor、worktree cleanup、Execution Record或Task登记仍需Agent处理时。
- 避免混用：不是Delivery结论或第二套Task lifecycle；maintenance attention不得撤销已确认Delivery。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)
## 任务管理器（Task Manager）

- 定义：`buildr.task-record/v2` 的默认 Skill provider，帮助 Agent 通过产品动作创建、恢复、激活和维护 Task Record。
- 适用范围：用户明确管理正式 Task Record，或 `task-triage` 判断正式持久交付即将首次写入的时点。
- 避免混用：不是所有任务的 dispatcher，不拥有 Task Environment 或任何专业阶段；Buildr Web 是同一 Application 的人类客户端，不通过 Task Manager 写入。
- 来源：[Task Record capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-record/v2.md)

## 父任务 / 子任务（Parent Task / Child Task）

- 定义：同一canonical Workspace内Task Record之间的直接协调层级；每个Child至多一个Parent，一个Parent可有多个直接Children。
- 适用范围：把可独立形成Candidate、Verification、Completion、不可变Handoff与Delivery的Contribution拆为Child，以及Buildr Web层级展示、导航和Task Manager显式设置、重挂或清除Parent。
- 避免混用：不是普通调查、编码、测试或Agent并行分工的强制建模方式，也不是依赖、排序、分组、Board membership或生命周期包含关系；Parent/Child的status、Result、Development、Review、Verification、Finish和cleanup相互独立。
- 来源：[Task Record capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-record/v2.md)

## 协调任务（Coordinating Task）

- 定义：通过Parent/Child关系管理一个或多个直接子Task的普通Task。
- 适用范围：用Task本身承载整体意图，并通过直接Children拆分可独立交付的工作。
- 避免混用：不是独立Board Domain、总调度器或状态聚合器；其终态仍由人或Agent明确决定。
- 来源：[任务生命周期架构讨论稿](../../docs/roadmap/task-lifecycle-architecture.md)

## 任务环境（Task Environment）

- 定义：某个正式 Task 的Buildr-managed checkout、Preparation、runtime projection、持久资源、正式环境证据与cleanup authority，由同一Task ID、唯一环境回执及实际checkout/provider/probe facts确定。
- 适用范围：共享执行根或`.worktrees/<task-id>`checkout、Agent登记的环境准备计划及其显式executable、CLI、Agent runtime投射、动态资源和cleanup。
- 避免混用：不是Workspace、保留工作区、Agent runtime、Task Record或普通工作的通用许可；Git worktree只是可选provider，retained Buildr的实现版本也不是该Environment的源码版本。
- 来源：[Task Environment capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-environment/v1.md)

## 环境准备计划（Environment Preparation Plan）

- 定义：Agent按正式Task完整Project/Service scope从Project Environment Preparation Declaration选择Recipe后，由Application解析并保存的Task级执行快照；Plan v2绑定Declaration与Recipe identity及规范化Step。
- 适用范围：Task Environment首次准备、幂等恢复、只读漂移检查，以及Receipt中的Declaration/Scope/Recipe/Step审计事实。
- 避免混用：不是Project长期声明、技术栈注册表、Task Record字段或Verification Result；Agent负责选择“本Task需要什么”，Environment负责解析、安全执行、保存和恢复。
- 来源：[Task Environment capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-environment/v1.md)

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

## 保留工作区 Buildr 环境管理器（Retained Buildr Environment Manager）

- 定义：从 canonical retained Workspace 运行 Task Environment Application 的受信 Buildr source/CLI 执行角色，负责会产生持久效果的环境 prepare、资源管理和 cleanup。
- 适用范围：Buildr 自举任务需要由候选 checkout 之外的稳定入口管理 Task Environment 时；Environment Receipt 记录其执行 identity。
- 避免混用：不是 Task Environment 的 source baseline、Candidate identity、retained target revision 或独立 lifecycle authority；matching Receipt 的只读 `inspect` 使用其登记 controller 做 probe，不要求 Buildr Web 等读取方成为 manager；现有 schema/code 中的 `controller` 只是内部实现字段名，不作为产品术语继续扩散。
- 来源：[Task Environment specification](../specs/task-environments/spec.md) 与 [Task lifecycle architecture roadmap](../../docs/roadmap/task-lifecycle-architecture.md)

## 环境回执（Environment Receipt）

- 定义：Task Environment Application在canonical Workspace SQLite的`task_environment_current`中按Task ID维护的本机事实，独占ready/blocked、resolved Plan、Declaration/Scope/Recipe/Step、Task checkout/provider、执行根、真实probes、资源和cleanup结果；旧schema仅作legacy只读解析。
- 适用范围：按 Task ID prepare/inspect/cleanup，以及 Verification、Preview、Finish 等正式消费者的执行绑定。
- 避免混用：不是 Task Record，也不保存 Agent session、凭证、任意 cleanup 命令或完整 Git provider receipt；其中的 controller identity 只是创建指纹，不是 lifecycle generation；不要把任何旧文件或已退役的跨专业投影当作 Environment authority。
- 来源：[Task Environment specification](../specs/task-environments/spec.md)

## Task checkout

- 定义：Task Environment 为某个工作范围登记并实际探测的源码 checkout；Git 场景由 start point、branch、HEAD、checkout/registration/clean 等 provider evidence 表达当前版本。
- 适用范围：Task Development、Environment probe、Candidate、Review、Verification 与 Finish 的源码执行边界。
- 避免混用：不等于 canonical retained Workspace checkout；retained Workspace 前进不会自动更新、rebase 或失效 Task checkout。
- 来源：[Task Environment specification](../specs/task-environments/spec.md)

## 环境管理器（Environment Manager）

- 定义：从 canonical retained Workspace 的可信 Buildr source 执行 Task Environment mutation 的 Buildr；Git-backed source 必须对规定实现输入保持 clean。
- 适用范围：Environment prepare、Task-owned resource register/release 与已授权 cleanup。
- 避免混用：不是 Task checkout 的版本基础，不拥有 Candidate、Review 或 Verification evidence；candidate Buildr 可只读 inspect，但不能管理自己的 Environment。
- 来源：[Task Environment capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-environment/v1.md)

## 控制器实现指纹（Controller Identity）

- 定义：Environment Receipt 创建时记录的 Buildr 实现 content fingerprint，保留用于兼容展示或诊断。
- 适用范围：`buildr.task-environment-receipt/v2` 的 `controller.identity` 字段与公开 read model。
- 避免混用：不表示 Task checkout 版本、Environment ready、动态资源 ownership、Verification applicability 或 lifecycle generation；retained Buildr 升级后不自动改写。
- 来源：[Task Environment specification](../specs/task-environments/spec.md)

## 任务验证工作区（Task Validation Workspace）

- 定义：某个 Task Environment 中用于验证该任务候选能力和实现的实际工作区根；Git 场景通常是 `.worktrees/<task-id>`，共享根场景可以与 canonical Workspace 相同。
- 适用范围：候选 Skill、CLI、功能、runtime 和实现的任务内验证。
- 避免混用：不称为“开发 Workspace”，也不因候选在其中通过就表示 retained runtime 已同步生效。
- 来源：[Task Environment specification](../specs/task-environments/spec.md)

## Git 操作约定（Git Operations）

- 定义：`buildr.git-operations/v1` 的 Skill-only 无状态能力，为 consumer 已选定的单次 Git Operation 提供授权、安全默认值、前后 identity 与最小 Result。能力名称使用复数 Git Operations；一次具体动作使用单数 Git Operation。
- 适用范围：直接用户或 Task Finish、Buildr 产品入口等 consumer 已明确 repository、operation、相关 ref、scope 与授权后的 commit、push、组合或其他单次动作。
- 避免混用：不是 Git 平台、命令教程、Task Finish 编排、Git worktree provider、Application、Receipt 或 transaction；不自行选择动作、目标、顺序、冲突语义或历史改写策略。
- 来源：[Git Operations capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/git-operations/v1.md)

## Git 工作树提供方（Git worktree provider）

- 定义：`buildr.git-worktree-provider/v1` 的窄 provider，只创建、检查和清理 Git checkout/branch，并保存 repository、HEAD、clean、registration 与 Git effects evidence。
- 适用范围：Task Environment 需要隔离 Git checkout，或用户明确管理 task worktree 时。
- 避免混用：不判断 Environment ready，不拥有 Runtime/CLI/依赖、projection、动态资源、恢复或总 cleanup。
- 来源：[Git worktree provider contract](../../services/buildr/resources/workspace/skills/contracts/buildr/git-worktree-provider/v1.md)

## 任务范围 Change 引用解析器（Task-scoped Change Reference Resolver）

- 定义：按 canonical Workspace、Task ID 和限定 `{project, change}` 从 matching Task Environment 候选或 retained Project 安全解析 Change 的共享只读能力。
- 适用范围：Task Record 引用校验和 Task 详情中的关联 Change。
- 避免混用：不接受调用方路径，不扫描全部 Task Environment，也不改变全局 retained-only Change 索引。
- 来源：[Change asset indexing specification](../specs/change-asset-indexing/spec.md)

## 任务审查（Task Review）

- 定义：面向正式 Task 的单一专业审查能力，由一个语义 Skill 动态判断审阅范围并执行 Review，由一个确定性 Application 校验、记录和读取结果。
- 适用范围：方案审查与完成审查共用同一 capability、Result 模型和 writer；两种类型只是同一能力的不同目标语义。
- 避免混用：不等于任务验证、任务资产审查、通用 Change review，也不编排 Task Development、Candidate 或生命周期门禁。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 审查结果（Review Result）

- 定义：绑定明确目标 identity 的轻量Workspace-local evidence，记录审查类型、执行方式、reviewed/uncovered、findings、结论和系统完成时间。
- 适用范围：Workspace SQLite中`planning|completion`两个可选current slots；同类型事务完整替换，不同类型互不覆盖。
- 避免混用：不是 Receipt、历史日志或状态机；不持久化 revision、current、applicability 或 digest，适用性由读取时目标比较派生。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 任务复盘（Task Retrospective）

- 定义：用户明确要求时，Agent面向terminal Task检查自身执行时间、token消耗、重复尝试、人机协作和Buildr workflow/harness成本，并形成一份自由Markdown效率报告。
- 适用范围：Workspace SQLite中按Task ID唯一的current Result；重复复盘完整替换，Buildr Web“复盘”Tab只读展示。
- 避免混用：不是Task Review、Verification、Development或Finish gate，不采集隐藏推理或完整轨迹，不自动写回Rule/Skill/产品资产。旧Task Asset Review与`.buildr/asset-review/`已退出current能力，数据保持inert。
- 来源：canonical `openspec/specs/task-retrospectives/spec.md`（本 Change converge 时建立）

## 复盘处置状态（Retrospective Disposition）

- 定义：一份 current Task Retrospective 的当前处置结论，只取 `pending | handled | no-action`。
- 适用范围：与 Result 保存在同一 `task_retrospective_current` row；重新记录报告会回到 `pending`，Agent 与 Buildr Web 共用同一 Application `handle`。
- 避免混用：`handled` 表示已完成处置判断，不表示建议已落地或改进 Task 已完成；`no-action` 必须有明确理由。
- 来源：canonical `openspec/specs/task-retrospectives/spec.md`

## 复盘来源（Retrospective Source）

- 定义：终态且存在 current 复盘的源 Task，由后续 Task Record 仅以 Task ID 关联。
- 适用范围：多个源 Task 指向同一后续 Task，或一个源 Task 指向多个后续 Task。
- 避免混用：不是 action item、Parent/Child、依赖或完成证明。

## 项目测试（Project Testing）

- 定义：面向 Project / Service 的无状态专业指导，帮助 Agent 根据真实技术栈设计测试框架、开发测试并编排反馈；分别判断测试主要意图、执行边界，以及一次编排的成本约束、选择范围和验证目标。
- 适用范围：Development、Acceptance、Static Conformance、Delivery / Release 意图；Static、Unit、Component、Integration、System 边界；Quick 成本约束；focus、affected、full 范围；开发目标、冻结 Candidate、Release artifact 验证节点。
- 避免混用：不是 Task Verification 或测试平台，不创建 Result、Receipt、Application 或 provider contract；Quick、affected/full、Candidate/Release 不是同一层级的测试类型，Candidate 不自动等于 full；System 是执行边界，不自动等于 Acceptance，`focus` 只用于诊断选择；此处 Component 表示组件测试边界，不是 Buildr 受管资产 Component。
- 来源：canonical `openspec/specs/project-testing-guidance/spec.md`（本 Change converge 时建立）

## 验证能力声明（Verification Capability Declaration）

- 定义：Project 根 `verification.yml` 中由团队确认的现有验证能力目录，使用 closed `buildr.project-verification/v2`，声明 capability identity、Project/Service scope、调用方式、适用条件、能证明的事实、交付要求和必要的环境/副作用边界。
- 适用范围：Task Verification 选择已有 command、脚本、CI wrapper 或 bounded Agent 操作时的 Project policy 输入。
- 避免混用：不是 Project Testing、测试框架、通用 DAG 或 Task lifecycle plan；能力缺失只形成 coverage gap，不能在 Verification 中自动开发测试。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 验证执行证据（Verification Execution Evidence）

- 定义：一次显式 capability invocation 产生的`buildr.verification-execution/v1`公开执行事实；Task外只对应transient evidence，正式Task还对应一条有限期Task Execution Record。
- 适用范围：Task Verification提炼current Result之前的本机execution、正式Task受控记录及transient evidence的有界cleanup。
- 避免混用：不是current Verification Result；Execution Record进入独立SQLite metadata authority但不进入Verification current slot，也不表达Task推进或风险接受。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 任务验证（Task Verification）

- 定义：面向正式 Task 的专业验证能力，按显式Project、Service所属Project与Change所属Project的有效并集读取declarations、选择并执行适用已有capability；有效并集为空时以唯一workspace coverage gap记录没有验证能力的负向事实，再通过唯一Application维护current Result。
- 适用范围：明确 target identity 的测试执行、Project/Service/workspace coverage gap 报告、Result 记录与 applicability 检查。
- 避免混用：不替代 Task Review、Task Environment 或业务验收，不开发缺失测试，也不拥有 Task Development、Candidate generation、`proceed / blocked` 或 Task 顶层状态。
- 来源：[Task Verification capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-verification/v3.md)

## 验证结果（Verification Result）

- 定义：Workspace SQLite中按Task ID唯一的closed `buildr.task-verification-result/v2` current row，绑定Task、current Candidate/generation、stable Content Target与实际declarations，记录从matching terminal Task Execution Records提炼的能力facts、portable evidence identities、coverage gaps、整体结论和完成时间；真正仅工作区时使用空declarations、空capabilities、唯一workspace gap与`not-passed`。合法v1 row只作`legacy-unbound`双读。
- 适用范围：CLI、Skill、Buildr Web 与 Task Development 共用的 current verification authority；读取时按Candidate、Content Target与declaration identity派生`current / stale / unknown / legacy-unbound`。Task Finish不直接消费该Result。
- 避免混用：不是raw Execution Evidence、Receipt、history或状态机；不保存完整输出、Environment Receipt、风险决定、推进决定或Candidate生成权。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 正式验证就绪度（Formal Verification Readiness）

- 定义：Task Development operation/compact Result在Development → Formal Verification交接处，根据current Task Context、Planning、Content Target、verification policy、Candidate与Verification gate派生的response-only摘要；产品值为`not-applicable|blocked|ready`。
- 适用范围：`formalVerificationReadiness`与Task Entry typed next；current Candidate已冻结且Verification缺失时为ready，consumer把显式Candidate lease交给Task Verification。Current Knowledge不再是固定前置预检。
- 避免混用：不是Verification Result、Development gate、Receipt、持久preflight authority或通用verification executor门禁；不适用于开发期focused/affected测试、Task外transient verification、Candidate CI或Planning Review前的OpenSpec semantic readiness。
- 来源：[Task Development specification](../specs/task-development/spec.md)与[OpenSpec Change生命周期](flows/openspec-change-lifecycle.md)。

## 任务研发（Task Development）

- 定义：正式Task从首个proposal、方案或直接实现等研发动作开始，在ready Environment中把planning facts、Task context、stable Content Target、verification policy和专业Result收敛为Task Candidate、推进决定与研发交接的唯一研发聚合authority；仅工作区不是第二种Task authority，只是有效Project集合为空时的受约束policy/Result语义。
- 适用范围：全研发区间的可选节点引用/currentness、实现收敛、formal Verification编排、Candidate freeze、Completion Review消费、风险/豁免决定和研发交接；Buildr Web可通过Application`inspect`只读展示这些事实。
- 避免混用：不是 Task Core、通用 planner/状态机、测试执行器、Git 交付器或 Task 顶层状态 writer；通用Development没有公共CLI，Parent coordination只开放受控Application薄接口。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 当前认知处置（Current Knowledge Disposition）

- 定义：selected Current Knowledge provider针对current Content Target形成、由Task Development保存的最小完成影响事实，包含tree identity、`aligned|not-applicable|attention|blocked`、portable summary、source identities与bounded unresolved items。
- 适用范围：实现、Review或Verification前后均可形成；handoff要求其current且非blocked。会导致错误完成结论的authority冲突为blocked，解释性漂移或无关历史债务为attention且保持可交付。
- 避免混用：不是规范、知识正文、Verification/Review Result、固定研发阶段或通用ready gate；任何knowledge写入改变delivery bytes时仍须重新观察Content Target。
- 来源：[Current Knowledge Maintenance capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/current-knowledge-maintenance/v2.md)

## Parent Plan

- 定义：采用新父子任务协调模型的Parent在唯一Development Receipt中保存的closed、内容寻址协调计划；v2包含outcome、architecture decisions、结构化Contribution Map与final acceptance，每个Contribution包含priority、title、objective、directions、boundaries、可选expectedChild与dependencies。
- 适用范围：Parent Planning Review target、Child Contribution binding、显式reconciliation与最终集成验收前置判断。
- 避免混用：`expectedChild`只是预期形态，不是Task ID、binding或已创建事实；Parent Plan也不是OpenSpec delta Change、Child状态/Result副本、Markdown checkbox进度或lifecycle authority。旧v1只读兼容且保持原identity，只能显式reconcile升级。
- 来源：[父子任务协调模型](../../docs/architecture/parent-child-task-coordination-model.md)

## Parent 启动就绪（Parent Startup Readiness）

- 定义：Parent Coordination基于current Task、matching Environment、Development、Parent Plan、Planning Review/gate及Contribution依赖派生的response-only启动投影。
- 适用范围：Parent-aware `task next`在首个Child创建前返回planning-review、refresh-parent-planning、eligible Contribution或依赖等待动作。
- 避免混用：不是新的Parent lifecycle状态、Receipt字段、自动planner或跨authority事务；它不自动Review、刷新gate、创建Child或准备Child Environment。
- 来源：[父子任务协调模型](../../docs/architecture/parent-child-task-coordination-model.md)

## Contribution Handoff

- 定义：承担Parent Contribution的Task在既有immutable Development handoff中保存的实际交付事实，明确planned、delivered、extra、residual、superseded、affected与唯一next action。
- 适用范围：Parent Coordination Application只在Child Finish terminal association匹配时据此证明delivery；预期Child与Task completed都不能代替真实binding和handoff。
- 避免混用：不是第二套Result、delivery registry、event/history/audit log，也不能由Task `completed`、代码或canonical specs推断。
- 来源：[父子任务协调模型](../../docs/architecture/parent-child-task-coordination-model.md)

## Parent reconciliation

- 定义：以current Parent Plan expected identity、完整next Plan和理由执行的显式计划mutation，用于处理越界/提前交付、依赖或验收变化及后续Child residual/superseded scope。
- 适用范围：新Plan identity形成后重做Parent Planning Review，并由Agent分别更新或abandon受影响Child。
- 避免混用：不是Child状态同步、自动scope推断、数据库migration或历史backfill；它不自动修改Child Task/Change。
- 来源：[父子任务协调模型](../../docs/architecture/parent-child-task-coordination-model.md)

## 研发回执（Development Receipt）

- 定义：Task Development Application在Workspace SQLite中按Task ID维护的唯一closed current记录；v3保存Environment逻辑引用、最小Task context、planning snapshot、可空Parent Plan/planned Contribution/final acceptance、可空Content Target、verification policy、current Candidate/generation、最小gates/dispositions、decision与不可变研发/Contribution handoff snapshots；v1/v2只读归一化为Parent facts absent，不读取或迁移旧YAML。
- 适用范围：Development inspect/begin/planning/observe/policy/gate/freeze/decide/handoff与Finish carrier equivalence；其他模块只能调用Application read model。
- 避免混用：不保存开发日志、进度、diff、完整Result/evidence、Environment本机资源、完整Candidate history、revision、CAS或锁；Task Finish不得直接打开SQLite，只消费Application handoff port。
- 来源：[Task Development capability contract](../../services/buildr/resources/workspace/skills/contracts/buildr/task-development/v2.md)

## 研发节点（Development Node）

- 定义：Development planning snapshot中对proposal、design、Project自定义规划artifact或其他正式研发节点的最小current引用，包含专业authority、portable reference、content identity、disposition与摘要。
- 适用范围：节点可以不存在、pending、current、stale、not-applicable或明确waived；存在时由Development聚合currentness，内容仍由对应专业authority拥有。
- 避免混用：不是通用任务step、progress、attempt、事件历史或artifact副本；`waived`不等于专业Result的ready/passed。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 明确豁免（waived）

- 定义：用户或具备业务授权的来源针对精确planning node或gate target明确允许不执行该节点的研发事实，必须保存summary与authorization source。
- 适用范围：Task Development planning与Planning/Verification/Completion gate disposition；用于解释为何允许继续Candidate或handoff。
- 避免混用：不等于not-applicable，不改写Review/Verification Result，不使stale/incomplete evidence变为current，也不自动接受负向Result风险。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 内容目标（Content Target）

- 定义：Development完成内容修改、测试开发、current knowledge和Change最终处置后，对ready Environment全部Task scopes的原Task source snapshot形成的稳定deliverable内容聚合identity；不读取retained最新Delivery Baseline。
- 适用范围：formal Task Verification 的 target，以及 Task Candidate 的内容输入和交付载体（Delivery Carrier）等价核验。
- 避免混用：不等于Git HEAD、commit、branch、worktree、Delivery Baseline、Environment、runtime projection、Agent session或Task lifecycle metadata；Git tracking/staging/commit载体和纯基线前进不改变相同任务贡献的Content Target。Workspace 根 `.buildr/daily-progress/` 是本机忽略数据，不进入 Content Target。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 任务候选（Task Candidate）

- 定义：Task Development在Task Context、Planning disposition、stable Content Target与verification policy明确后冻结的Task级交付候选身份与正整数generation；identity只绑定Content Target、Task context、policy identity和generation。Verification、Completion与Current Knowledge随后绑定该Candidate但不改变其identity或generation。
- 适用范围：Completion Review target、Development decision/handoff和Finish carrier equivalence。
- 避免混用：不等于 Product Candidate verification、Git commit/branch/worktree、Task Environment、runtime projection、Agent session、tarball 或其他交付载体；不包含 Planning、Verification 或 Completion Result identity。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## Product Candidate verification

- 定义：Project Testing为完整产品候选组织的验证目标/编排；Buildr Product由`test:candidate`及其GitHub分布式投影执行完整registry回归。发布模型完成适配后，每个current release HEAD/tree只对应matching Product Candidate generation和唯一tarball。
- 适用范围：显式完整Project回归、冻结release source的发布候选门禁或用户要求的full validation。
- 避免混用：不是 Task Candidate，也不会自动创建Task Candidate/generation、Completion Review或研发交接；changed/affected开发反馈不等于完整Product Candidate。
- 来源：[Verification ownership](../../docs/verification-ownership.md)

## 发布集合（Release Collection）

- 定义：由维护者为一个精确package version从指定`dev` baseline创建的唯一`release-<version>`内容集合；后续只纳入维护者明确选择且带`-x` provenance的`dev` commit或同版本明确授权的release-only metadata，不自动追随`dev`。
- 适用范围：release create/update/freeze/abandon/cleanup、Product Candidate source、release→main PR、protected publication和发布后main→dev收敛。
- 避免混用：不是release Task、Task worktree、Task Candidate、npm dist-tag或GitHub Release；同名branch/ref只是载体，必须同时核验version、baseline、selection chain和HEAD/tree identity。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`。

## 发布选择链（Release Selection Chain）

- 定义：从release的精确`dev` baseline开始，按维护者授权顺序记录每个source dev commit、带`-x` provenance的result release commit、release-only metadata和generation的closed可验证链。
- 适用范围：release更新审计、Candidate currentness、readiness、transaction context和失败恢复。
- 避免混用：不是通用Git history、聊天中的commit列表或caller-claimed success；冲突现场、未授权commit和普通`dev`前进不能被静默加入链。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`。

## 发布源身份（Release Source Identity）

- 定义：current release HEAD commit、Git tree和selection chain identity组成的冻结source；下游Product Candidate、tarball、main tree和transaction context必须精确绑定它。
- 适用范围：Candidate generation、artifact manifest/integrity、release→main tree equality、pre-tag readiness和publish evidence。
- 避免混用：不是Task Candidate identity、近似branch name、最新`dev`、main commit identity或版本字符串；source任一部分变化都会使旧下游evidence stale。
- 来源：canonical `openspec/specs/release-collection-model/spec.md`与`openspec/specs/product-verification-quality/spec.md`。

## 交付载体（Delivery Carrier）

- 定义：交付载体（Delivery Carrier）是承载Task Contribution的commit、branch、PR、tarball、安装包或其他交付介质；Buildr自动Finish可创建run-owned隔离carrier，Agent也可选择其他已授权载体。
- 适用范围：自动Finish prepare/deliver、Agent直接交付与Delivery Reconciliation。
- 避免混用：不是Task Candidate或Development Content Target，也不是所有Task Delivery的强制前置条件。`agent-reviewed-delivery-adaptation`只表示Agent完成语义处理，不表示Buildr确定性证明语义等价。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 任务贡献（Task Contribution）

- 定义：Git-backed Finish从原任务基线tree到冻结Task source snapshot tree观察到的canonical Git delta，绑定path、mode与before/after blob identities。
- 适用范围：在最新Delivery Baseline机械创建隔离Delivery Carrier、记录适配来源facts与Environment cleanup独立复算；Development通过原Task source Content Target判断applicability，不消费最新baseline重算该identity。
- 避免混用：不是Candidate、changed-path列表或语义安全结论；Git clean apply、clean rebase和路径不重叠都不能替代Agent语义核对、identity证明或既有verification policy。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 交付基线（Delivery Baseline）

- 定义：Task Finish prepare读取的最新目标commit/tree，是机械应用Task Contribution、Delivery Adaptation和交付的Git基础。
- 适用范围：目标分支前进、target-race recovery与carrier/delivery/cleanup evidence；不参与Development Content Target identity。
- 避免混用：不是原任务基线、Content Target或Task Candidate；它前进不自动表示任务贡献变化，也不自动递增Candidate generation或重跑Verification/Completion Review。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 自举激活（Self-bootstrap Activation）

- 定义：Buildr自举Workspace取得matching Task delivery result后，由`buildr-self-bootstrap` Component按冻结Task Contribution activation paths执行的本机产品收敛动作。
- 适用范围：自动Finish或Delivery Reconciliation之后，去重组合retained package sync、development Buildr Web、retained Project bridge identity gate与Doctor。
- 避免混用：不是Task Delivery、Formal Finish强制阶段、Task Record完成状态或新workflow authority；失败只形成Activation attention，不改写Delivery或上游研发事实。
- 来源：[Agent task workflow specification](../specs/agent-task-workflows/spec.md)与[Buildr package assets specification](../specs/buildr-package-assets/spec.md)

## 交付适配（Delivery Adaptation）

- 定义：Task Contribution无法机械应用到最新Delivery Baseline时，Agent只在run-owned隔离Delivery Carrier中完成的语义兼容处理；Buildr随后核验确定性Git、identity、cleanliness与Project policy要求的compatibility check facts。
- 适用范围：Task Finish同一blocked run的`prepare → verify → deliver → cleanup`恢复；成功结果标记`agent-reviewed-delivery-adaptation`。
- 避免混用：不是原Task worktree rebase、Candidate修改、formal Verification、Completion Review或Buildr语义等价证明；无法判断时必须保持blocked。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 自修复 Provider 载体（Bootstrap Provider Capsule）

- 定义：retained Task Finish 在已有run满足封闭恢复资格且用户单独授权后，从current ready Task Environment与current Development handoff共同冻结的clean committed checkout派生的run-owned、detached provider source；外置authority manifest绑定run、Candidate/generation、Content Target、source commit/tree与provider digest。
- 适用范围：只用于恢复`preflight|prepare`的确定`product-phase-provider`异常；Execution Record成功open后创建，后续同run resume复用，cleanup phase持久化passed后由retained finalizer撤销可执行source authority。
- 避免混用：不是Delivery Carrier、candidate CLI、npm tarball、任意module/manifest入口、通用sandbox、第二writer或新的Execution Capsule；canonical run与SQLite mutation仍只属于retained Application/repository。
- 来源：[Task Finish execution 规范](../specs/task-finish-execution/spec.md)

## 研发交接（Development Handoff）

- 定义：Development Receipt中append-only不可变快照，绑定Task Candidate、Change dispositions、Current Knowledge最小disposition、Planning/Verification/Completion最小Result引用、`proceed`决定和精确用户风险接受。
- 适用范围：Task Finish 的唯一正式输入；上游事实漂移时旧 snapshot 保留但不再 current。
- 避免混用：不是 Candidate identity、Finish execution plan 或完整 Result history；Finish 不能自行从 Task/Git/Change/Result 拼装研发交接。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 方案审查（Planning Review）

- 定义：Task Review 对当前 Task Intent 与计划上下文执行的审查，Result 绑定对应专业authority提供的计划目标身份（Plan Target Identity）。
- 适用范围：实现前方案检查；没有执行时 planning slot 可以不存在。
- 避免混用：不要求所有Task固定为OpenSpec artifacts；正式Task的OpenSpec计划必须先通过OpenSpec Semantic Readiness Preflight，再使用Task Planning Identity resolver。Planning Review不拥有、保存、复制或解释preflight检查，不由Agent手工摘要artifact、路径或执行进度。
- 来源：[Agent task workflow specification](../specs/agent-task-workflows/spec.md)

## 计划目标身份（Plan Target Identity）

- 定义：专业planning authority对当前Task计划语义生成的稳定opaque identity；OpenSpec场景由Task Planning Identity Application基于Task Intent/scope及proposal、design、delta specs、tasks的closed semantic projection确定性生成。
- 适用范围：Task Development planning snapshot与Planning Review applicability比较；OpenSpec active/archive、checkbox、path、mtime、progress、Brief及workflow sidecar变化不改变该identity。
- 避免混用：不是raw file digest、Git ref、Environment identity、Review Result identity、Content Target或Candidate；无法可靠解析时为空并`blocked`，不得沿用旧值。
- 来源：[Task Planning Identity specification](../specs/task-planning-identity/spec.md)

## 完成审查（Completion Review）

- 定义：Task Review 对实现、证据与 Task Intent 整体一致性的审查，Result 必须绑定真实、明确的 Candidate target identity。
- 适用范围：调用方已经能够证明 Candidate identity 时记录 completion slot；没有 Candidate 或没有执行时该 slot 可以不存在。
- 避免混用：不生成 Candidate identity，不用 HEAD、dirty tree 或任意 digest 伪造 Candidate，也不替代 Task Verification。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 交付目标前进（Target Advancement）

- 定义：Task Finish 交付 Candidate 期间，目标分支、远端 ref 或非 Git 目标位置出现了新的目标事实。
- 适用范围：P0.5 Finish adapter发现目标与carrier preparation时观察的ref不一致后，终止当前run并返回Development重新建立stable target、Verification、Candidate与handoff。
- 避免混用：不是 Task Environment 漂移或自动 source update 事件；retained target 前进本身不要求任务 checkout、Review 或 Verification 自动更新。
- 来源：[Task lifecycle architecture roadmap](../../docs/roadmap/task-lifecycle-architecture.md)

## 收尾就绪候选（Finish-ready Candidate）

- 定义：已有 current 正式研发交接的 Task Candidate；实现、current knowledge、Change 处置、formal Verification、Completion Review、推进与风险决定均已在 Development 闭合。
- 适用范围：Task Finish的输入资格与Development/Finish责任边界。
- 避免混用：不等于“代码大致完成”，也不授权Finish收敛Change、修改内容、运行formal Verification、生成Candidate或接受风险；发现缺陷、target advancement或等价性失败时必须退出到Development。
- 来源：[Task Finish执行规范](../specs/task-finish-execution/spec.md)

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
- 适用范围：描述 retained Workspace sync 后可精确归因的 runtime 投影差异；新 Task Finish 会在 prepare 完成全部候选 mutation 后统一冻结和验证，不用该术语绕过冻结候选的最终保证。
- 避免混用：lockfile、source、非受管 generated asset、手工修复或无法精确归因的 diff 都是 implementation-changed，不可复用原验证证据。
- 来源：[OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)

## Skill 投射所有权回执（Skill Projection Ownership Receipt）

- 定义：Buildr 为某个 destination、Agent adapter 与 runtime Skill path 保存的本机控制状态，用文件 inventory、identity 和 digest 证明 Buildr 对该次 Skill 投射的更新权与清理权。
- 适用范围：`.buildr/agent-runtime/<workspace|user>/<adapter>/skill-projection-ownership-receipts/`，以及 render、inventory、Doctor、Component/builtin lifecycle 的所有权判断。
- 避免混用：不是 Agent 消费的 Skill、源资产、执行证据或可提交到 Git 的 portable receipt；旧 `<runtime-root>/buildr/skill-projection-receipts/` 只是受控迁移输入，不是第二 authority。
- 来源：[Workspace-first runtime projection specification](../specs/workspace-first-runtime-projection/spec.md)
