# 建立任务环境（Task Environment）

## 一句话摘要

为每个正式 Task 建立一份可恢复、可执行、可核验、可清理的 Environment Receipt；由共享 Application 同时服务 CLI、Skills 与 Local App，并把 Git worktree 收窄为 provider evidence。

## 背景与问题

现有 `task-worktree` 同时充当 Git evidence 与完整环境 authority，导致没有 worktree 的 Task 无法进入同一模型，Preview/Finish 等消费者也直接依赖旧 receipt。Task Record 和 Local App 还只能从 retained Project 识别 Change，无法读取任务环境中的未集成候选。

P0.1 已提供正式 Task ID 和 Task Record。P0.2 需要接住后续研发、验证与收尾共同依赖的本机环境事实，同时保持宽而薄。

## 目标与非目标

目标是让正式 Task 通过唯一 Environment Receipt 得到真实 `ready / blocked`、可恢复执行位置、持久资源和 cleanup 事实；让 CLI、Skills、Local App 与产品模块复用同一 Application；并让 Task Record 的 Change 引用能安全解析任务环境候选。

非目标是不建设 Task Core、通用状态机、锁/CAS/租约/调度器或多 writer；不把 Environment 字段写入 Task Record；不在 Local App 提供 Environment mutation 或 Board；不证明 Agent session adoption；不提前实现 Development、Review、Verification Result 或后续完整 Finish 模型。

## 受影响用户或角色

- 通过 CLI/Skill 准备、恢复或清理正式 Task 的 Agent 与维护者。
- 在 Local App 中查看 Task、环境和关联 Change 的人。
- 提供 Git checkout、Preview、Runtime/CLI/依赖与 cleanup evidence 的产品 provider。
- 继续独占 Candidate/验证 evidence 的 Task Verification，以及只提交 cleanup eligibility 的 Task Finish。

## 核心流程

Task Manager 先创建或恢复 Task Record。Task Environment `prepare` 从 canonical Workspace/Project/Service 形成计划，登记共享执行根或创建 Git worktree，准备 Runtime/CLI/依赖与候选 projection，真实 probe 后写入 `ready / blocked`。Local App 和 `inspect` 只读观察同一环境；Task 关联 Change 通过 Task-scoped Resolver 读取任务环境候选或 retained source。Finish 完成交付后只提交清理资格，由 Environment 停止资源并调用 providers。

## 关键变化

- 任务环境应用（Task Environment Application）是 Environment Receipt 的唯一 writer，提供 `prepare`、`inspect`、内部资源登记/释放与 `cleanup`。
- 公共 CLI 只提供 `buildr task environment prepare|inspect|cleanup <task-id>`；`prepare` 幂等承担恢复，统一返回 `buildr.task-environment-result/v1`。
- canonical `.buildr/tasks/<task-id>/environment.json` 独占 ready/blocked、执行位置、Runtime/CLI/依赖、runtime projection identity、动态资源与 cleanup；Task Record 不增加环境字段。
- Git 工作树提供方（Git worktree provider）只保存 checkout/branch/HEAD/clean 等 evidence。`.worktrees/` 是多个任务环境 checkout 的容器，不是 Workspace 或 Agent runtime。
- Local App 在 Task 详情新增独立只读“环境”页签。它在打开、聚焦或手动刷新时调用 Application `inspect`，显示当前机器的最新探测与 `observedAt`；不提供 mutation、WebSocket 或持续轮询。
- 任务范围 Change 引用解析器（Task-scoped Change Reference Resolver）让同一 `{project, change}` 引用优先读取任务环境候选，并同时表达 retained baseline/归档 provenance。全局 Change 列表保持 retained-only。
- Task Record schema/domain validator 保留，但新增引用改用共享 Resolver；只查 retained Project 的旧位置判断退出。`openspec validate` 仍校验解析到的 Change artifacts/spec，不承担 checkout 选择。引用暂时不可用不能让 Task inspect/list 消失，也不能阻止删除该引用或修改无关字段。
- Buildr 自举由 retained stable controller 管理环境；候选 CLI/runtime 只在自身任务验证工作区测试，集成后才更新正式 runtime。真实 Agent session proof 留给 P0.4 Task Verification。

### Cleanup 与迁移

Preview、dev server 等持久资源先登记再报告成功；Finish 只提交 cleanup eligibility，由 Task Environment 停止资源并调用 providers。

同一 Change 内一次性处理旧 v1 receipt：正式且 identity 匹配的活跃环境迁移为 v2；无 Task 的活跃 worktree 只保留 Git evidence；无真实资源的陈旧 receipt 删除；identity 冲突则阻止 Workspace authority 切换并保留现场。不会保留 permanent legacy adapter。

同时删除旧 `task-worktree-lifecycle@1/@2` contracts/bindings、environment writer、`worktree context|adopt`、adoption/session state、旧 help/JSON/runtime routes、直接 consumers 与重复测试/资产。旧 identity 只允许留在一次性 migration module/fixtures 和 OpenSpec history。

## 影响、风险与兼容性

这是一次破坏性的 authority 切换：公共 Task Environment CLI/JSON、Local App Environment 投影与 Task-scoped Change 读取会新增，但 Task Record schema/顶层状态不变。历史 receipt 必须逐项分类，identity 冲突会阻止 Workspace 激活，不能用永久 adapter 掩盖。第一版单 writer；发现可见漂移或共享根 ownership 不清时返回 blocked。候选能力只能在自身任务验证工作区生效，集成后才更新 retained runtime。

## 验收摘要

- 有/无 Git 的正式 Task 都能通过唯一 Receipt 得到真实 `ready / blocked`。
- CLI、Skill、Local App、Preview 与 Finish 复用同一 Application，没有第二个环境 writer。
- Task 页面能只读查看当前机器环境；任务环境中的 Change 能按 Task 安全展示，retained 全局索引不被污染。
- 自举 worktree 使用自己的 lockfile/`node_modules`；候选 runtime 不能写 retained/peer runtime。
- Preview 登记失败立即回收；正常完成和明确放弃都由 Environment 统一清理。
- 双正式 Task 能从不同目录使用各自 Environment 执行 CLI、验证和 Preview；错误 Task 与活跃 Task 的未授权 cleanup 均会失败，清理一个环境不影响另一个。
- 四类旧 receipt 被逐项迁移、清退或阻断；旧 mutation/routing/binding 不再可达。
- Roadmap、Change artifacts、产品/技术架构、流程、Service 与术语表使用同一 authority 边界；retained cutover 仍等待候选集成后执行。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
