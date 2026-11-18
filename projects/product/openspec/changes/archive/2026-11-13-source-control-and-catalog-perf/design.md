## Context

1. 在 `source-control-application.ts` 中，即使 `SourceControlObservations` 已经命中并传入部分未变化工作树的 `observedWorktrees`，`scanSourceControl` 仍在循环内部为每一个缓存项调用 `reading.prepareVerification([source])(source)`，导致单次请求内对同一仓库重复执行多次 `git worktree list` 与 `git rev-parse --git-common-dir`；同时 `observeCodeWorktrees` 与 `prepareVerification` 均使用阻塞 `execFileSync` 串行核对全部工作树身份，`readSourceControlTaskAssociations` 也会再次调用 `gitCommonDirectory`。
2. `GET /api/v1/app/agent-service/activity-summary` 已经通过 `?revision=<sha256>` 返回 `{ revision, unchanged: true }` 的契约与前端复用模式验证，可由 `GET /api/v1/app/agent-service/model-catalog` 直接复用同一模式。
3. 在非代码视图或全屏专注对话时，壳层持续挂载的 `WorkspaceSourceControlProvider` 仍保持 `source-control-watch` 连接并在每次文件变更后触发后台状态扫描，可在 `createSourceControlObserver` 上增加与 `setVisible` 同结构的 `setActive` 暂停/恢复开关按需延后观察。

## Goals / Non-Goals

- Goals:
  - 每次 `sourceControl` / `sourceControlInWorker` 读单仓时，枚举与收束 `worktree list` 各自最多执行 1 次；复用本请求内已核实的 `commonDirectory`；在 Worker 异步路径中以有界并发（上限 6）完成检出身份解析与未缓存工作树 `git status`。
  - 为 `model-catalog` 响应引入确定性 SHA-256 `revision`，支持 `?revision=<64-hex>` 在内容一致时返回 `{ revision, unchanged: true }`，变化时返回完整目录加最新 `revision`。
  - 仅在用户处于工作空间可见代码区域（`area === 'code'` 且非全屏专注对话）时开启后台 `source-control-watch` 与自动状态核对，离开代码视图时暂停、切回或显式刷新时立即补查。
- Non-Goals:
  - 不改变 `SourceControlObservations` 的 10 秒工作树观察窗口，不放宽 `.git` 元数据监听对同库工作树的保守全量失效策略，也不改变同步 `observeGitCheckoutReadIdentity` 的既有调用计数。
  - 不更改浏览器前端既有 30 秒 / 5 秒轮询间隔或 `modelCatalog()` 对外返回结构。

## Decisions

- 在 `createSourceControlApplication` 中将每仓全部需要确认的检出（缓存复用项与本次 `observeSourceControl` 读取项）收集到统一验证队列，在全部状态读取完成后调用一次 `prepareVerification` / `prepareVerificationAsync`，既保持逐检出的失效隔离语义，又消除重复的 `worktree list` 与 `commonDirectory` 子命令。
- 保留同步 `observeGitCheckoutReadIdentity` 与 `createCodeWorktreeReadSession` 供既有同步测试和写操作使用；新增 `observeGitCheckoutReadIdentityAsync` 与 `createCodeWorktreeReadSessionAsync` 服务 `sourceControlInWorker`。
- `AgentModelCatalog` Schema 采用与 `AgentActivitySummary` 一致的 `anyOf` 闭合结构；`agentConversationsApi.modelCatalog()` 在检测到写入操作（`changeModels`）时递增值代并清空 `catalogSnapshot`，若服务端返回 `unchanged: true` 而本地无可核对基线则自动回退无参数重拉一次完整目录。
- `createSourceControlObserver` 将 `started && visible && active && !disposed` 统一收口为 `observing()`：`setActive(false)` 与页面隐藏共用 `pause()` 中止 `watch` 与调度器，而显式 `refresh()` 仍可随时触发；`setActive(true)` 清除初始延迟并触发一次 `reconcile(undefined, true)` 补查，同时恢复监听与周期兜底。

## Risks / Trade-offs

- 多工作树并发执行 `observeGitCheckoutReadIdentityAsync` 与 `observeSourceControlAsync` 将同一仓库内的子进程并发度控制在有界上限 `6` 以内，避免在大量工作树下瞬间派生过多 Git 进程。
- 为保持兼容，未返回 `revision` 的外部或测试 mock 响应仍可被前端 `modelCatalog()` 正常消费而不会进入版本匹配分支。
- 非代码页面下延迟代码观察期间，左侧代码导航角标不再实时更新，切回代码页后立即补查显示最新状态。
