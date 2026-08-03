# Buildr Product 术语表

本表维护 Buildr Product 的 canonical terminology。规范行为仍以 OpenSpec specs 为准。

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

## 正式任务（Formal Task）

- 定义：目标与持久交付意图已经对齐，并以稳定 Task ID 进入 Buildr 生命周期管理的任务。
- 适用范围：准备产生代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他可交付持久变化的工作。
- 避免混用：普通对话、只读探索、临时操作或 Agent runtime 中泛称的 task/thread 不会自动成为正式任务。
- 来源：canonical `openspec/specs/task-record/spec.md`（本 Change convergence 时建立）。

## 任务记录（Task Record）

- 定义：正式任务在 canonical Workspace 中的最小顶层事实，保存 Task ID、标题、意图、Project/Service scope、0..N 个限定 Change、状态、终态摘要和系统时间。
- 适用范围：`.buildr/tasks/<task-id>/task.yml` 及 Task Record Application 的 create、inspect、update、complete、abandon 动作。
- 避免混用：不保存或索引 Task Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective 的专业事实；响应级 `recordDigest` 也不是持久字段。
- 来源：canonical `openspec/specs/task-record/spec.md`（本 Change convergence 时建立）。

## 任务管理器（Task Manager）

- 定义：`buildr.task-record/v1` 的默认 Skill provider，帮助 Agent 通过产品动作创建、恢复和维护 Task Record。
- 适用范围：用户明确管理正式 Task Record，或 `task-triage` 判断正式持久交付即将首次写入的时点。
- 避免混用：不是所有任务的 dispatcher，不拥有 Task Environment 或任何专业阶段；Local App 是同一 Application 的人类客户端，不通过 Task Manager 写入。
- 来源：[Task Record capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-record/v1.md)

## 任务环境（Task Environment）

- 定义：某个正式 Task 在当前机器上可执行、可恢复和可清理的实际工作环境，由同一 Task ID、唯一环境回执及其中的实际 checkout/provider/probe facts 确定。
- 适用范围：共享执行根或 `.worktrees/<task-id>` checkout、Workspace Node/CLI/依赖、Agent runtime 投射、动态资源和 cleanup。
- 避免混用：不是 Workspace、保留工作区、Agent runtime 或 Task Record；Git worktree 只是可选 provider，retained Buildr 的实现版本也不是该 Environment 的源码版本。
- 来源：[Task Environment capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-environment/v1.md)

## 保留工作区 Buildr 环境管理器（Retained Buildr Environment Manager）

- 定义：从 canonical retained Workspace 运行 Task Environment Application 的受信 Buildr source/CLI 执行角色，负责会产生持久效果的环境 prepare、资源管理和 cleanup。
- 适用范围：Buildr 自举任务需要由候选 checkout 之外的稳定入口管理 Task Environment 时；Environment Receipt 记录其执行 identity。
- 避免混用：不是 Task Environment 的 source baseline、Candidate identity、retained target revision 或独立 lifecycle authority；matching Receipt 的只读 `inspect` 使用其登记 controller 做 probe，不要求 Local App 等读取方成为 manager；现有 schema/code 中的 `controller` 只是内部实现字段名，不作为产品术语继续扩散。
- 来源：[Task Environment specification](../specs/task-environments/spec.md) 与 [Task lifecycle architecture roadmap](../../docs/roadmap/task-lifecycle-architecture.md)

## 环境回执（Environment Receipt）

- 定义：Task Environment Application 在 canonical Workspace 的 `.buildr/tasks/<task-id>/environment.json` 维护的本机事实，独占 ready/blocked、Task checkout/provider、执行根、真实 probes、资源和 cleanup 结果。
- 适用范围：按 Task ID prepare/inspect/cleanup，以及 Verification、Preview、Finish 等正式消费者的执行绑定。
- 避免混用：不是 Task Record，也不保存 Agent session、凭证、任意 cleanup 命令或完整 Git provider receipt；其中的 controller identity 只是创建指纹，不是 lifecycle generation。
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

- 定义：绑定明确目标 identity 的可移植、Git 跟踪轻量 evidence，记录审查类型、执行方式、reviewed/uncovered、findings、结论和系统完成时间。
- 适用范围：`.buildr/tasks/<task-id>/reviews/planning.yml|completion.yml` 两个可选 current 槽位；同类型完整替换，不同类型互不覆盖。
- 避免混用：不是 Receipt、历史日志或状态机；不持久化 revision、current、applicability 或 digest，适用性由读取时目标比较派生。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 项目测试（Project Testing）

- 定义：面向 Project / Service 的无状态专业指导，帮助 Agent 根据真实技术栈设计测试框架、开发测试并编排反馈；分别判断测试主要意图、执行边界和编排场景。
- 适用范围：Development、Acceptance、Static Conformance、Delivery / Release 意图；Static、Unit、Component、Integration、System 边界；Quick、Task-affected、Candidate、Release 场景。
- 避免混用：不是 Task Verification 或测试平台，不创建 Result、Receipt、Application 或 provider contract；System 是执行边界，不自动等于 Acceptance，`focus` 只用于诊断选择；此处 Component 表示组件测试边界，不是 Buildr 受管资产 Component。
- 来源：canonical `openspec/specs/project-testing-guidance/spec.md`（本 Change converge 时建立）

## 验证能力声明（Verification Capability Declaration）

- 定义：Project 根 `verification.yml` 中由团队确认的现有验证能力目录，使用 closed `buildr.project-verification/v2`，声明 capability identity、Project/Service scope、调用方式、适用条件、能证明的事实、交付要求和必要的环境/副作用边界。
- 适用范围：Task Verification 选择已有 command、脚本、CI wrapper 或 bounded Agent 操作时的 Project policy 输入。
- 避免混用：不是 Project Testing、测试框架、通用 DAG 或 Task lifecycle plan；能力缺失只形成 coverage gap，不能在 Verification 中自动开发测试。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 验证执行证据（Verification Execution Evidence）

- 定义：一次显式 capability invocation 产生的 transient `buildr.verification-execution/v1` 事实，包含完整命令终态、stdout/stderr、耗时、临时路径、资源协调和诊断。
- 适用范围：Task Verification 提炼 portable Result 之前的本机 execution，以及消费后的有界 cleanup。
- 避免混用：不是 current Verification Result，不进入 Git 跟踪的 portable slot，也不表达 Task 推进或风险接受。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 任务验证（Task Verification）

- 定义：面向正式 Task 的专业验证能力，读取相关 Project declarations、选择并执行适用的已有 capability，再通过唯一 Task Verification Application 记录或读取 current Result。
- 适用范围：明确 target identity 的测试执行、coverage gap 报告、Result 记录与 applicability 检查。
- 避免混用：不替代 Task Review、Task Environment 或业务验收，不开发缺失测试，也不拥有 Task Development、Candidate generation、`proceed / blocked` 或 Task 顶层状态。
- 来源：[Task Verification capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-verification/v3.md)

## 验证结果（Verification Result）

- 定义：`.buildr/tasks/<task-id>/verification.yml` 中唯一 current、可移植、Git 跟踪的 closed `buildr.task-verification-result/v1`，绑定 Task、明确 target、实际 declarations，记录执行能力的精炼事实、coverage gaps、整体结论和完成时间。
- 适用范围：CLI、Skill、Local App 与临时 Finish consumer 共用的 current verification authority；读取时按 target/declaration identity 派生 `current / stale / unknown`。
- 避免混用：不是 Execution Evidence、Receipt、history 或状态机；不保存完整输出、Environment Receipt、revision、风险决定、推进决定或 Candidate generation。
- 来源：[Task Verification specification](../specs/task-verification/spec.md)

## 方案审查（Planning Review）

- 定义：Task Review 对当前 Task Intent 与计划上下文执行的审查，Result 绑定调用方提供的 plan target identity。
- 适用范围：实现前方案检查，以及 Task-scoped Change 详情中的审查 Agent action；没有执行时 planning slot 可以不存在。
- 避免混用：不要求固定为 OpenSpec artifacts，也不把全局 retained-only Change review 改造成 Task Review。
- 来源：[Agent task workflow specification](../specs/agent-task-workflows/spec.md)

## 完成审查（Completion Review）

- 定义：Task Review 对实现、证据与 Task Intent 整体一致性的审查，Result 必须绑定真实、明确的 Candidate target identity。
- 适用范围：调用方已经能够证明 Candidate identity 时记录 completion slot；没有 Candidate 或没有执行时该 slot 可以不存在。
- 避免混用：不生成 Candidate identity，不用 HEAD、dirty tree 或任意 digest 伪造 Candidate，也不替代 Task Verification。
- 来源：canonical `openspec/specs/task-review-results/spec.md`（本 Change converge 时建立）

## 交付目标前进（Target Advancement）

- 定义：Task Finish 交付 Candidate 期间，目标分支、远端 ref 或非 Git 目标位置出现了新的目标事实。
- 适用范围：Finish 判断能否在 Candidate 内容/语义和 evidence 仍适用时自主完成机械交付变换，或必须停止并让用户决定是否返回 Development。
- 避免混用：不是 Task Environment 漂移或自动 source update 事件；retained target 前进本身不要求任务 checkout、Review 或 Verification 自动更新。
- 来源：[Task lifecycle architecture roadmap](../../docs/roadmap/task-lifecycle-architecture.md)

## 工作区元数据存储（Workspace Metadata Store）

- 定义：canonical Workspace 中由 `.buildr/` 承载的文件型 Buildr 数据边界，包含可移植生命周期 metadata 与本机管理事实。
- 适用范围：源码 clean/readiness 分类与 Task Metadata Publication 的分层处理；前者整体排除 `.buildr/`，后者只按各 writer 的 portable exact owned paths 发布。
- 避免混用：不等于把 `.buildr/` 全部加入 `.gitignore`、全部纳入 Git、跳过 collision/ownership 检查，或赋予目录级 transaction authority。
- 来源：[Task lifecycle architecture roadmap](../../docs/roadmap/task-lifecycle-architecture.md)

## 收尾就绪候选（Finish-ready Candidate）

- 定义：研发实现、自审、必要审查、开发验证和 current knowledge 已完成，允许 Task Finish 只做确定性收敛、冻结、最终保证、交付与清理的候选。
- 适用范围：Task Finish 的输入资格与研发/收尾责任边界。
- 避免混用：不等于“代码大致完成”，也不表示 Task Finish 可以修复产品缺陷；收尾发现产品缺陷时必须退出并回到研发、审查和测试验证流程。
- 来源：[Task Finish 执行规范](../specs/task-finish-execution/spec.md)

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
