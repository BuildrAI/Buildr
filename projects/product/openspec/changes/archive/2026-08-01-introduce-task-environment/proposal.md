## Why

Buildr 现有 `task-worktree` 同时承担 Git checkout、环境就绪、runtime 投射、恢复与清理，导致 Git evidence 与任务环境生命周期事实混在同一份旧 receipt 中，也把没有 worktree 的正式 Task 排除在统一环境模型之外。P0.1 已建立正式 Task Record；P0.2 需要用一层宽而薄的任务环境（Task Environment）接住后续研发、验证与收尾，并让 Agent、CLI 与 Local App 通过同一产品逻辑看到真实环境。

现有 Task Record 的 Change 校验只读取保留工作区（retained Workspace）中的 Project，因此任务环境内尚未集成的 Change 无法被 Task Record 和 Local App 正确识别。Change 不应为适配这个限制而提前写入 retained Project；需要改造的是引用解析边界。

## What Changes

- 新增共享任务环境应用（Task Environment Application）与 `buildr.task-environment/v1` capability。Application 是 Environment Receipt 的唯一 writer，确定性完成 `prepare`、`inspect`、内部资源登记/释放与 `cleanup`。
- 新增薄公共 CLI：`buildr task environment prepare|inspect|cleanup <task-id>`。CLI 只解析参数、调用 Application，并以 `buildr.task-environment-result/v1` 返回结构化结果；`prepare` 幂等承担首次准备与恢复，不另设 `restore` 命令。
- 为每个正式 Task 在 canonical Workspace 的 `.buildr/tasks/<task-id>/environment.json` 维护唯一环境回执（Environment Receipt）。它独占 `ready / blocked`、执行位置、runtime/CLI/依赖、runtime projection identity、动态资源与 cleanup 结果；Task Record 不增加任何环境字段。
- 环境可以使用 retained Workspace 中已存在的共享执行根，也可以组合 provider。Git 需要隔离时使用 Git 工作树提供方（Git worktree provider）；`.worktrees/` 只是多个任务环境 checkout 的容器，`.worktrees/<task-id>` 可以同时是 checkout、执行根和任务验证工作区（Task Validation Workspace）根，但不是主 Workspace、retained Workspace 或 Agent 运行时（Agent runtime），也不称为“开发 Workspace”。
- **BREAKING**：将 `buildr.task-worktree-lifecycle@1/@2` 降为窄 Git provider evidence，并删除旧 environment writer、`worktree context|adopt`、adoption/session state、旧 environment-shaped help/JSON、直接 consumer routing 与冲突 binding。现有 `worktree create|inspect|cleanup` 可以保留为 provider-level 命令，但只通过新的 `buildr.git-worktree-result/v1` 表达 Git 事实。
- 只保留与正常 routing 隔离的一次性旧 receipt reader/migrator。正式活跃且 identity 匹配的旧环境迁移为 v2 Receipt；无 Task 的活跃 worktree 只保留 Git evidence；无真实资源的陈旧 receipt 删除；identity 冲突则阻止该 Workspace 的 authority 切换并原样保留现场。P0.2 不保留永久 legacy inspect/cleanup adapter。
- 环境准备从 canonical Workspace、Project、Service 与现有 runtime/command authority 生成确定性计划，在实际执行根中准备并探测 Runtime、Workspace CLI、依赖与 runtime projection。Buildr 自举中的 Node checkout 使用 Workspace Node、自己的 lockfile 与独立 `node_modules`，只共享下载缓存。
- 候选 Skill、CLI、功能与 runtime 可以在自身任务验证工作区测试；只有集成到 retained source 后，正式 retained runtime 才能同步生效。Environment Receipt 只记录 source/projection identity，不记录或证明真实 Agent session 采用；该证明属于 P0.4 Task Verification。
- Local App 在现有 Task 详情中新增独立“环境”页签。页面通过 Workspace-scoped API 直接调用 Task Environment Application 的 `inspect`，只读展示当前机器的最新探测、环境状态、执行根、Runtime/CLI/依赖、provider evidence、资源与 cleanup 结果；不提供 prepare/cleanup 按钮，不复制环境字段到 Task Record，也不建设 WebSocket 或持续轮询。
- 新增任务范围 Change 引用解析器（Task-scoped Change Reference Resolver）。Task Record 继续只保存 `{project, change}` 逻辑引用；解析器按 canonical Workspace、Task ID 和限定引用，从匹配任务环境的 Project 执行根读取未集成 Change，或从 retained Project 读取已集成/归档 Change。全局 Change 列表仍只索引 retained Project。
- Task Record 的 closed schema/domain validator 保留；新增 Change 引用时改用共享解析器校验。被替换的是“只查 retained Project”的旧位置判断，不是 `openspec validate`：后者继续校验解析到的 Change artifacts 与 spec 契约，但不再决定 Change 必须位于哪个 checkout。读取 Task、删除失效引用或修改无关字段时，不得因引用暂时只在另一机器、已迁移或不可用而隐藏整条 Task Record；应返回稳定的引用诊断。Task Record Application 与 Local App 不直接解析 Environment Receipt。
- Local App Preview、dev server 等 Task-owned 持久资源在创建后立即向 Application 登记，登记失败则回收刚创建的资源。Task Finish 只提交清理资格，Task Environment 统一编排 provider cleanup。
- 第一版只支持同一 Task 单一 active writer 和按 Task ID 串行恢复。发现 receipt 或真实资源已变化时 fail closed；不建设 Task Core、锁、CAS、租约、多 writer 并发、调度器或通用环境声明。

## Capabilities

### New Capabilities

无。P0.2 收敛并改造现有 capability，不创建第二套平行环境规范。

### Modified Capabilities

- `task-environments`: 建立 Task Environment Application、唯一 Environment Receipt、公共 CLI、可组合 provider、真实 ready 探测、资源登记、串行恢复、统一 cleanup 与一次性旧 receipt 迁移。
- `task-record`: 保持 Task Record schema 不含环境字段；改用任务范围 Change 引用解析器，并在 Local App Task 详情增加只读“环境”页签与安全 API。
- `change-asset-indexing`: 增加 Task-scoped Change 读取与 provenance，保持全局 Change 索引 retained-only。
- `cli-product-surface`: 登记 `buildr task environment prepare|inspect|cleanup`，并清退旧 `worktree context|adopt` 环境入口。
- `public-json-contracts`: 登记 `buildr.task-environment-result/v1` 与窄 `buildr.git-worktree-result/v1` 公开 JSON families。
- `agent-task-workflows`: 增加 `task-environment` Skill 路由和正式持久交付前的 ready 门槛，并把现有正式消费者从旧 worktree lifecycle 切到新契约。
- `buildr-package-assets`: 原子交付新 Skill、Application、CLI、contracts、binding、Local App/API 与迁移验证，并删除冲突旧 identity、consumer edges 和 runtime routing。
- `workspace-first-runtime-projection`: 明确任务验证工作区的候选投射边界，以及 projection identity 与真实 Agent session 采用证据的分工。
- `worktree-local-app-preview`: 将 Preview 从旧 worktree receipt 归属改为 Environment Receipt 动态资源，由 Task Environment 负责登记失败回收和最终清理。
- `task-finish-execution`: 将 Finish 的本机清理阶段改为向 Task Environment 提交已交付/可清理事实，不再直接调用 worktree cleanup 或拥有环境清理结果。
- `concurrent-task-acceptance`: 将双任务验收从旧 `worktree context`、caller owner 和直接 worktree cleanup，切换为正式 Task、Environment Receipt、任务资源归属与 Environment cleanup 证据。

## Impact

- 唯一产品实现根仍为 `projects/product/services/buildr/`；将新增 Task Environment Domain/Application/repository、CLI interface、任务范围 Change 引用解析器、Local App Environment reader/API、provider adapters 与专项验证，并拆分现有 worktree application 的混合职责。
- 随包资产将新增 `task-environment` Skill、`buildr.task-environment/v1`、`buildr.task-environment-result/v1`、`buildr.git-worktree-result/v1` 与窄 Git provider contract，更新 `task-worktree`、`task-triage`、`task-finish` 及 capability bindings。候选资产只在本任务验证工作区测试，集成后才由 retained product source 同步到正式 runtime。
- 现有 worktree receipt/JSON 不再作为环境 authority；旧数据读取仅存在于一次性迁移模块，不形成长期双写、双路由或第二套 ready/cleanup 结论。
- 测试覆盖 Task Record gate、共享执行根与 Git worktree、Node 依赖准备、真实 ready/blocked、跨 session 恢复、Local App 环境投影、任务范围 Change 解析、动态资源、一次性迁移、Finish cleanup handoff、候选 runtime 边界及其他任务不受影响。
- P0.1 Task Record 的 schema、writer、顶层状态与 Task 页面概览保持不变；P0.2 只在同一 Task 详情组合新的只读专业投影，不实现 Environment UI mutation、Board、Development、Review、Verification Result、Agent session evidence 或后续完整 Finish 模型。
