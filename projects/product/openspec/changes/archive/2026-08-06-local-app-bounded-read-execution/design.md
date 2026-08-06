## Context

Local App 的 HTTP handler 已经是异步函数，但 development、reviews、verification 的 Application read model 最终仍在当前 Node 线程中打开 `DatabaseSync` 并执行同步查询。三个 Tab 的事实读取已经各自收敛到 Task Development、Task Review、Task Verification 及 Finish 写入的关联快照；本 Change 只处理这些只读调用的执行位置和容量，不重新设计事实 authority。

当前代码还要求 `withWorkspaceStructuredStoreOperation` 保持同步 scope，不能把一个打开的 SQLite connection 跨异步边界共享。因此执行器必须把完整的只读 Application 调用放在独立执行单元中，并让每个执行单元自行打开、关闭自己的 read-only database。

## Goals / Non-Goals

**Goals:**

- 让三个 Task 专业只读 Tab 的阻塞读取离开 HTTP 主 event loop。
- 使用固定数量的 long-lived Worker，提供 FIFO、有界队列、稳定拒绝、错误传播和请求取消语义。
- 让 Worker 只执行白名单 read operation，并把已解析的 Workspace root 与 Task ID 作为受控输入。
- 在 HTTP、executor 和 Worker 三层提供可注入测试边界，证明最大并发、调用次数、排队、取消和失败行为。
- 在服务关闭时终止 executor，避免遗留 Worker 或挂起请求。

**Non-Goals:**

- 不改变 Task、Development、Review、Verification、Finish 或 lifecycle read model 的 authority。
- 不创建第二个 Structured Store，不共享 `DatabaseSync` connection，不改变 SQLite schema/migration。
- 不把写入、Environment、worktree、Finish、Doctor 迁移到 Worker；它们继续使用现有必要 Git 校验。
- 不为普通 Workspace 读写建立通用调度平台，不支持任意 filesystem path 或任意 Worker operation。
- 不保证取消已经开始的同步 SQLite 查询能够在数据库调用中途被强行中断；取消保证调用方不再收到结果，执行单元完成后丢弃该结果。

## Decisions

### 1. 采用固定容量 Worker pool

Local App 创建一个固定容量的 read executor，默认容量为 2，队列默认上限为 32。每个 Worker 在启动时组合一次 Buildr runtime，收到白名单 operation 后调用对应的 `inspectTaskDevelopmentView`、`inspectTaskReviewView` 或 `inspectTaskVerificationView`，并将可序列化 read model 返回主线程。

选择 long-lived pool 是为了避免每请求创建 Worker 的启动和内存开销，也避免用 Promise 包装同步函数造成“异步但仍阻塞”的假象。队列超过上限时立即返回稳定的 `local_app_read_queue_full`，不允许无界积压。

替代方案：

- `setImmediate` 或 Promise：不能把 `DatabaseSync` 移出 event loop，只改变调度时机，放弃。
- 每请求一个 Worker：隔离直观但无界创建，放弃。
- 一个全局数据库读写线程：会形成新的共享 authority 和跨 Workspace 生命周期边界，放弃。

### 2. Worker 接收 operation descriptor，而不是函数或 runtime

主线程只发送 `{ operation, targetRoot, taskId }`，operation 只允许三个 Task 专业 read view。Worker 内部自行创建 runtime 和 read-only connection，完成后立即关闭由 Application 打开的 database。这样不会跨线程传递函数、connection、filesystem object 或用户输入的任意路径，也不会让主线程的 runtime 状态成为第二份持久事实。

`targetRoot` 由 Local App 在 Workspace registry 中解析后传入；Worker 不重新做 Git/worktree provenance 或 `git rev-parse`。写入和其他非只读 Application 不经过该 executor。

### 3. 队列和取消采用显式状态机

executor 维护 `idle -> running -> idle` 的固定 Worker 状态和 `queued -> running -> settled|cancelled` 的请求状态。入队前检查关闭、取消和队列容量；排队中的取消从 FIFO 队列移除；运行中的取消立即拒绝调用方但不重试、不重复执行，Worker 返回后丢弃结果并继续服务后续请求。Worker 异常只结算当前请求，并在 executor 未关闭时补充一个空闲 Worker。

### 4. HTTP 只读路由使用 executor，保留同步 Application 入口

现有 Application 方法保持同步，便于 CLI、内部 driver 和写入路径继续使用原有契约。Local App server 只对三个 Tab 路由调用 executor，并为客户端连接关闭建立 AbortSignal；其他 GET 和所有 mutation 保持原调用路径。测试可注入 fake executor，以直接证明 HTTP 不再调用被替换的主线程 read method。

### 5. 把容量与调用证据放在 Integration/System

真实 Worker 生命周期、队列容量、错误和取消使用 Integration 测试；HTTP 路由、三个 Tab 的独立 operation 与现有 no-Git/terminal-aggregator 保护使用 System 测试。Unit/Contract 不穿过 Worker、HTTP 或真实 SQLite 边界。测试只观察计数、最大并发、响应状态和稳定错误，不保存本机路径或完整日志。

## Risks / Trade-offs

- [Risk] 每个 Worker 各自加载完整 Buildr runtime，增加 Local App 内存和启动成本。→ 默认固定容量为 2，并只在 Local App server 生命周期内创建；读取能力不是每请求冷启动。
- [Risk] Worker 读取的 filesystem 状态可能与主线程在请求开始后的瞬时状态不同。→ root 与 Task ID 在入队时固定，读取仍消费同一 Workspace authority；返回的是一次 read model snapshot，不宣称跨请求事务一致性。
- [Risk] 运行中取消不能中断已经进入 `DatabaseSync` 的调用。→ 取消只承诺不交付结果、不重试、不重复执行；Worker 完成后释放容量，测试覆盖该事实。
- [Risk] Worker crash 可能让一次请求失败。→ 只结算受影响请求，补建固定容量 Worker，并返回稳定内部错误；不把失败转换为空 read model。
- [Risk] 队列满时页面可能收到 503。→ 返回稳定 diagnostic，前端保留既有错误展示，调用方可稍后重试；不会通过无限排队隐藏资源耗尽。

## Migration Plan

1. 在候选 Environment 中加入 executor、Worker 和三类 read operation 的测试边界。
2. 将 Local App 三个 Tab route 接到 executor，并在 server close 时释放 pool。
3. 运行 affected Integration/System tests，确认现有 read model、no-Git 和 no-terminal-aggregate 证据不变。
4. 若新 executor 行为异常，回滚只读 route 的 executor 接入，保留既有同步 Application 方法；不涉及数据库迁移或数据回滚。

## Open Questions

无。容量默认值与队列上限属于 Local App 内部受控配置，本 Change 以 2/32 的固定默认值和测试证据锁定行为。
