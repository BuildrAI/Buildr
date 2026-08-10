# Buildr Product 术语表

本表维护 Buildr Product 的 canonical terminology。规范行为仍以 OpenSpec specs 为准。

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

## Workspace Local Data Store

- 定义：Buildr Local在一个canonical Workspace中维护的全部单机local-only数据范围；当前包含Workspace Structured Store，也可包含明确声明为本机事实的其他存储。
- 适用范围：不应进入Git、runtime投射或跨机器同步的Workspace本地数据。
- 避免混用：不是单个数据库文件，不等于portable工作资产；未来Buildr Server/Cloud的共享authority不属于本地数据存储。
- 来源：[技术架构](architecture/technical.md)

## Workspace File Store

- 定义：Workspace中以文件和目录承载的portable或writer-owned事实，包括manifests、Rules、Skills、Specs及专业Task records。
- 适用范围：需要文件发现、审阅、Git版本化或独立writer ownership的工作资产与记录。
- 避免混用：不是Workspace内所有文件的统称，也不包含local-only SQLite structured data。
- 来源：[技术架构](architecture/technical.md)

## Workspace Structured Store

- 定义：Buildr Local为每个canonical Workspace维护的独立SQLite，用于索引、关系、聚合和事务特征明显的结构化数据。
- 适用范围：`.buildr/local/workspace.sqlite`及其版本化SQL migration lifecycle；Task Record是首个consumer。
- 避免混用：不是同步数据库、portable asset或组织协作authority；不得把SQLite文件上传或复制为Buildr Server/Cloud协议。
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


### Buildr Web（buildr-web）

- 含义：Product 下与 `buildr` 同仓同级的 workspace Service，拥有 Local App React/Vite 前端源码与构建；产物由 `buildr` 消费到 `web-dist` 并同源托管。
- 适用范围：前端工程边界、构建交接与 Service registry；不表示独立 Git 仓或独立生产端口。
- 避免混用：不是 Local App HTTP/runtime authority，也不改变 session 安全模型。

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
- 避免混用：普通对话、只读探索、临时操作或 Agent runtime 中泛称的 task/thread 不会自动成为正式任务。
- 来源：canonical `openspec/specs/task-record/spec.md`（本 Change convergence 时建立）。

## 任务记录（Task Record）

- 定义：正式任务在 canonical Workspace 中的最小顶层事实，保存 Task ID、标题、意图、Project/Service scope、0..N 个限定 Change、状态、终态摘要和系统时间。
- 适用范围：Workspace Structured Store中的规范化Task数据、至多一个直接Parent与直接Children，以及Task Record Application的create、inspect、update、complete、abandon动作。
- 避免混用：Parent/Child 只表达协调层级，不是依赖或通用关系图，不传播状态、Result或专业动作；Task Record不保存Task Environment、Development、Review、Verification、Git、Finish、独立Board或Retrospective的专业事实，响应级`recordDigest`也不是持久字段。
- 来源：canonical `openspec/specs/task-record/spec.md`（本 Change convergence 时建立）。

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

## Task Finish

- 定义：消费 current Development Handoff、执行 `preflight → prepare → verify → deliver → cleanup` 的固定五阶段交付收尾 adapter；current run、target lease 与 compact terminal Result 由 Workspace SQLite 持久化。
- 适用范围：Delivery Carrier、目标推进、远端回读、Environment cleanup、可恢复 blocked/cleanup-pending 状态，以及每次真正执行的首次run/resume在专业副作用前open并retained的独立Finish diagnostics Execution Record。
- 避免混用：不是 Task Development、Task Verification、Task Record writer 或第二套 Task complete 状态机；`task_finish_current`不保存record identity/history或完整checks/operations/output，Delivery Carrier、target、lease、resume与恢复资源也不转交Execution Record owner。`task complete`只表示所有Finish gates通过后的Task Record terminal status；`.buildr/task-finish`是已退役的旧文件协议，不属于新runtime的输入。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)
## 任务管理器（Task Manager）

- 定义：`buildr.task-record/v1` 的默认 Skill provider，帮助 Agent 通过产品动作创建、恢复和维护 Task Record。
- 适用范围：用户明确管理正式 Task Record，或 `task-triage` 判断正式持久交付即将首次写入的时点。
- 避免混用：不是所有任务的 dispatcher，不拥有 Task Environment 或任何专业阶段；Local App 是同一 Application 的人类客户端，不通过 Task Manager 写入。
- 来源：[Task Record capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-record/v1.md)

## 父任务 / 子任务（Parent Task / Child Task）

- 定义：同一canonical Workspace内Task Record之间的直接协调层级；每个Child至多一个Parent，一个Parent可有多个直接Children。
- 适用范围：协调Task拆分、Local App层级展示与导航，以及Task Manager显式设置、重挂或清除Parent。
- 避免混用：不是依赖、排序、分组、Board membership或生命周期包含关系；Parent/Child的status、Result、Development、Review、Verification、Finish和cleanup相互独立。
- 来源：[Task Record capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-record/v1.md)

## 协调任务（Coordinating Task）

- 定义：通过Parent/Child关系管理一个或多个直接子Task的普通Task。
- 适用范围：用Task本身承载整体意图，并通过直接Children拆分可独立交付的工作。
- 避免混用：不是独立Board Domain、总调度器或状态聚合器；其终态仍由人或Agent明确决定。
- 来源：[任务生命周期架构讨论稿](../../docs/roadmap/task-lifecycle-architecture.md)

## 任务环境（Task Environment）

- 定义：某个正式 Task 在当前机器上可执行、可恢复和可清理的实际工作环境，由同一 Task ID、唯一环境回执及其中的实际 checkout/provider/probe facts 确定。
- 适用范围：共享执行根或`.worktrees/<task-id>`checkout、Agent登记的环境准备计划、Workspace Node/CLI、Agent runtime投射、动态资源和cleanup。
- 避免混用：不是 Workspace、保留工作区、Agent runtime 或 Task Record；Git worktree 只是可选 provider，retained Buildr 的实现版本也不是该 Environment 的源码版本。
- 来源：[Task Environment capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-environment/v1.md)

## 环境准备计划（Environment Preparation Plan）

- 定义：Agent按正式Task完整Project/Service scope从Project Environment Preparation Declaration选择Recipe后，由Application解析并保存的Task级执行快照；Plan v2绑定Declaration与Recipe identity及规范化Step。
- 适用范围：Task Environment首次准备、幂等恢复、只读漂移检查，以及Receipt中的Declaration/Scope/Recipe/Step审计事实。
- 避免混用：不是Project长期声明、技术栈注册表、Task Record字段或Verification Result；Agent负责选择“本Task需要什么”，Environment负责解析、安全执行、保存和恢复。
- 来源：[Task Environment capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-environment/v1.md)

## 项目环境准备声明（Project Environment Preparation Declaration）

- 定义：Project根可选`preparation.yml`中的长期环境准备事实，使用closed`buildr.project-environment-preparation/v1`声明Project-wide或Service-scoped Recipe。
- 适用范围：团队已知的依赖准备、代码生成、工具初始化等可重复入口；支持只有Project、没有Service的结构，也支持多个Service分别声明。
- 避免混用：不是Task Plan、Receipt、技术栈自动发现结果或状态store；候选可由Agent只读发现，但长期写入必须经用户授权。
- 来源：[Project Environment Preparation Declaration specification](../specs/project-environment-preparation-declarations/spec.md)

## 项目声明接入（Project Declaration Intake）

- 定义：面向Project `preparation.yml`与`verification.yml`的无状态Agent编排入口，在注册、首次Task、入口变化、专业gap或显式请求时只读发现候选与差异。
- 适用范围：确认Project-only或多Service scope、汇总证据与外部诊断、向用户请求精确长期写入授权，并把已授权动作交给各声明owner Skill。
- 避免混用：不是统一Declaration store/schema/writer、后台扫描器或Task结果；不管理`capabilities.yml`/`commands.yml`，未经用户确认不写长期声明。
- 来源：[Project Declaration Intake specification](../specs/project-declaration-intake/spec.md) 与 [Buildr 项目声明体系](../../docs/architecture/buildr-project-declaration-system.md)

## 环境准备配方（Environment Preparation Recipe）

- 定义：Preparation Declaration中的稳定可选单元，绑定一个Project或Service scope，并包含一个或多个明确、无shell、有输入输出身份的有序Step。
- 适用范围：Agent按Task scope组合多个Recipe，表达多Service或非Node技术栈的具体准备动作。
- 避免混用：不是package manager adapter、递归manifest扫描、Verification capability或跨Task共享输出；语言和工具差异由Project/Service wrapper与明确executable表达。
- 来源：[Project Environment Preparation Declaration specification](../specs/project-environment-preparation-declarations/spec.md)

## 保留工作区 Buildr 环境管理器（Retained Buildr Environment Manager）

- 定义：从 canonical retained Workspace 运行 Task Environment Application 的受信 Buildr source/CLI 执行角色，负责会产生持久效果的环境 prepare、资源管理和 cleanup。
- 适用范围：Buildr 自举任务需要由候选 checkout 之外的稳定入口管理 Task Environment 时；Environment Receipt 记录其执行 identity。
- 避免混用：不是 Task Environment 的 source baseline、Candidate identity、retained target revision 或独立 lifecycle authority；matching Receipt 的只读 `inspect` 使用其登记 controller 做 probe，不要求 Local App 等读取方成为 manager；现有 schema/code 中的 `controller` 只是内部实现字段名，不作为产品术语继续扩散。
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
- 来源：[Task Environment capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-environment/v1.md)

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
- 来源：[Git Operations capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/git-operations/v1.md)

## Git 工作树提供方（Git worktree provider）

- 定义：`buildr.git-worktree-provider/v1` 的窄 provider，只创建、检查和清理 Git checkout/branch，并保存 repository、HEAD、clean、registration 与 Git effects evidence。
- 适用范围：Task Environment 需要隔离 Git checkout，或用户明确管理 task worktree 时。
- 避免混用：不判断 Environment ready，不拥有 Runtime/CLI/依赖、projection、动态资源、恢复或总 cleanup。
- 来源：[Git worktree provider contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/git-worktree-provider/v1.md)

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
- 适用范围：Workspace SQLite中按Task ID唯一的current Result；重复复盘完整替换，Local App“复盘”Tab只读展示。
- 避免混用：不是Task Review、Verification、Development或Finish gate，不采集隐藏推理或完整轨迹，不自动写回Rule/Skill/产品资产。旧Task Asset Review与`.buildr/asset-review/`已退出current能力，数据保持inert。
- 来源：canonical `openspec/specs/task-retrospectives/spec.md`（本 Change converge 时建立）

## 复盘处置状态（Retrospective Disposition）

- 定义：一份 current Task Retrospective 的当前处置结论，只取 `pending | handled | no-action`。
- 适用范围：与 Result 保存在同一 `task_retrospective_current` row；重新记录报告会回到 `pending`，Agent 与 Local App 共用同一 Application `handle`。
- 避免混用：`handled` 表示已完成处置判断，不表示建议已落地或改进 Task 已完成；`no-action` 必须有明确理由。
- 来源：canonical `openspec/specs/task-retrospectives/spec.md`

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

- 定义：面向正式 Task 的专业验证能力，读取相关 Project declarations、选择并执行适用的已有 capability，再通过唯一 Task Verification Application 记录或读取 current Result。
- 适用范围：明确 target identity 的测试执行、coverage gap 报告、Result 记录与 applicability 检查。
- 避免混用：不替代 Task Review、Task Environment 或业务验收，不开发缺失测试，也不拥有 Task Development、Candidate generation、`proceed / blocked` 或 Task 顶层状态。
- 来源：[Task Verification capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-verification/v3.md)

## 验证结果（Verification Result）

- 定义：Workspace SQLite中按Task ID唯一的closed `buildr.task-verification-result/v1` current row，绑定Task、stable Content Target与实际declarations，记录执行能力的精炼事实、coverage gaps、整体结论和完成时间。
- 适用范围：CLI、Skill、Local App 与 Task Development 共用的 current verification authority；读取时按 Content Target/declaration identity 派生 `current / stale / unknown`。Task Finish不直接消费该Result。
- 避免混用：不是 Execution Evidence、Receipt、history 或状态机；不保存完整输出、Environment Receipt、revision、风险决定、推进决定或 Candidate generation。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 任务研发（Task Development）

- 定义：正式Task从首个proposal、方案或直接实现等研发动作开始，在ready Environment中把planning facts、Task context、stable Content Target、verification policy和专业Result收敛为Task Candidate、推进决定与研发交接的唯一研发聚合authority。
- 适用范围：全研发区间的可选节点引用/currentness、实现收敛、formal Verification编排、Candidate freeze、Completion Review消费、风险/豁免决定和研发交接；Local App可通过Application`inspect`只读展示这些事实。
- 避免混用：不是 Task Core、通用 planner/状态机、测试执行器、Git 交付器或 Task 顶层状态 writer；通用Development没有公共CLI，Parent coordination只开放受控Application薄接口。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## Parent Plan

- 定义：采用新父子任务协调模型的Parent在唯一Development Receipt中保存的closed、内容寻址协调计划，只包含outcome、architecture invariants、Contribution Map、dependencies与final acceptance。
- 适用范围：Parent Planning Review target、Child Contribution binding、显式reconciliation与最终集成验收前置判断。
- 避免混用：不是OpenSpec delta Change、Child状态/Result副本、实现清单、Markdown checkbox进度或lifecycle authority；普通Child状态变化不改变其bytes或identity。
- 来源：[父子任务协调模型](../../docs/architecture/parent-child-task-coordination-model.md)

## Contribution Handoff

- 定义：承担Parent Contribution的Task在既有immutable Development handoff中保存的实际交付事实，明确planned、delivered、extra、residual、superseded、affected与唯一next action。
- 适用范围：Parent Coordination Application只在Child Finish terminal association匹配时据此证明delivery；Parent亲自承担的窄Contribution可由Parent current handoff证明。
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
- 来源：[Task Development capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-development/v2.md)

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
- 避免混用：不等于Git HEAD、commit、branch、worktree、Delivery Baseline、Environment、runtime projection、Agent session或Task lifecycle metadata；Git tracking/staging/commit载体和纯基线前进不改变相同任务贡献的Content Target。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 任务候选（Task Candidate）

- 定义：Task Development在formal Verification facts完整后冻结的Task级交付候选身份与正整数generation；identity只绑定完整Content Target、Task Intent/scope/Change context、verification policy decision和generation。
- 适用范围：Completion Review target、Development decision/handoff和Finish carrier equivalence。
- 避免混用：不等于 Product Candidate verification、Git commit/branch/worktree、Task Environment、runtime projection、Agent session、tarball 或其他交付载体；不包含 Planning、Verification 或 Completion Result identity。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## Product Candidate verification

- 定义：Project Testing为完整产品候选组织的验证目标/编排；Buildr Product当前由`test:candidate`执行完整registry回归。
- 适用范围：显式完整Project回归、Release前检查或用户要求的full validation。
- 避免混用：不是 Task Candidate，也不会自动创建 Candidate/generation、Completion Review 或研发交接。
- 来源：[Verification ownership](../../docs/verification-ownership.md)

## 交付载体（Delivery Carrier）

- 定义：交付载体（Delivery Carrier）是Task Finish为实际交付承载Task Contribution的commit、branch、tarball、安装包或其他run-owned隔离载体；Git conflict时可先保留最新Delivery Baseline供Agent完成Delivery Adaptation。
- 适用范围：Finish prepare/deliver与retained transition；当前Buildr自举adapter在run-owned detached Git worktree中形成commit。
- 避免混用：不是Task Candidate或Development Content Target；Finish不得改写原Task worktree。`agent-reviewed-delivery-adaptation`只表示Agent在carrier完成语义处理并通过适用checks，不表示Buildr确定性证明语义等价。
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

- 定义：Buildr自举Workspace在Formal Task Finish成功后，由`buildr-self-bootstrap` Component只按该Result绑定的冻结Task Contribution paths选择并执行的本机产品收敛动作。
- 适用范围：去重组合retained package sync、development CLI安装、development Local App安装与最终Doctor；只存在于显式安装该Component的Buildr自举Workspace。
- 避免混用：不是Formal Task Finish阶段、通用retained runtime activation、Task Verification、Task Record完成状态或新的workflow authority；失败不得改写已成功的Finish Result、Environment cleanup或上游研发事实。
- 来源：[Agent task workflow specification](../specs/agent-task-workflows/spec.md)与[Buildr package assets specification](../specs/buildr-package-assets/spec.md)

## 交付适配（Delivery Adaptation）

- 定义：Task Contribution无法机械应用到最新Delivery Baseline时，Agent只在run-owned隔离Delivery Carrier中完成的语义兼容处理；Buildr随后核验确定性Git、identity、cleanliness与Project policy要求的compatibility check facts。
- 适用范围：Task Finish同一blocked run的`prepare → verify → deliver → cleanup`恢复；成功结果标记`agent-reviewed-delivery-adaptation`。
- 避免混用：不是原Task worktree rebase、Candidate修改、formal Verification、Completion Review或Buildr语义等价证明；无法判断时必须保持blocked。
- 来源：[Task Finish execution specification](../specs/task-finish-execution/spec.md)

## 研发交接（Development Handoff）

- 定义：Development Receipt 中 append-only 不可变快照，绑定 Task Candidate、Change dispositions、Planning/Verification/Completion 最小 Result 引用、`proceed` 决定和精确用户风险接受。
- 适用范围：Task Finish 的唯一正式输入；上游事实漂移时旧 snapshot 保留但不再 current。
- 避免混用：不是 Candidate identity、Finish execution plan 或完整 Result history；Finish 不能自行从 Task/Git/Change/Result 拼装研发交接。
- 来源：[Task Development specification](../specs/task-development/spec.md)

## 方案审查（Planning Review）

- 定义：Task Review 对当前 Task Intent 与计划上下文执行的审查，Result 绑定调用方提供的 plan target identity。
- 适用范围：实现前方案检查；没有执行时 planning slot 可以不存在。
- 避免混用：不要求固定为 OpenSpec artifacts，也不由 Local App Change 详情发起；Local App 只读展示 Change。
- 来源：[Agent task workflow specification](../specs/agent-task-workflows/spec.md)

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

## Workspace Node Version

- 定义：Workspace 在 `.buildr/workspace.yml` 中明确采用的精确 Node.js toolchain 版本，由 `init` 首次确定，之后只能通过显式 Workspace 配置变更升级或降级。
- 适用范围：Buildr CLI、npm、测试、Verification、Candidate 与 Finish 的统一 Node 选择。
- 避免混用：不是 `package.json#engines.node` 的产品兼容范围，也不是 Agent runtime 可自行保存或决定的版本。

## Workspace Node Identity

- 定义：由 Workspace identity、精确 Node version、platform 与 architecture 组成的稳定摘要，用于绑定 task environment、验证 evidence 与 Finish frozen candidate。
- 适用范围：检查本机受管 runtime 与 Workspace 声明是否一致，以及决定旧 evidence 是否可复用。
- 避免混用：不包含某台机器的临时绝对路径，也不等于 Agent runtime identity。

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
