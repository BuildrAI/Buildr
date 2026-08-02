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

- 定义：某个正式 Task 在当前机器上可执行、可恢复和可清理的实际工作环境，由同一 Task ID 和唯一环境回执确定。
- 适用范围：共享执行根或 `.worktrees/<task-id>` checkout、Workspace Node/CLI/依赖、Agent runtime 投射、动态资源和 cleanup。
- 避免混用：不是 Workspace、保留工作区、Agent runtime 或 Task Record；Git worktree 只是可选 provider。
- 来源：[Task Environment capability contract](../../services/buildr/package/targets/workspace/skills/contracts/buildr/task-environment/v1.md)

## 环境回执（Environment Receipt）

- 定义：Task Environment Application 在 canonical Workspace 的 `.buildr/tasks/<task-id>/environment.json` 维护的本机事实，独占 ready/blocked、执行根、真实 probes、资源和 cleanup 结果。
- 适用范围：按 Task ID prepare/inspect/cleanup，以及 Verification、Preview、Finish 等正式消费者的执行绑定。
- 避免混用：不是 Task Record，也不保存 Agent session、凭证、任意 cleanup 命令或完整 Git provider receipt。
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
