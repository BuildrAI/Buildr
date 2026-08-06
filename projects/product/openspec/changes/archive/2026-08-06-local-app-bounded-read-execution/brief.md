# Local App 有界非阻塞读取

## 一句话摘要

为 Local App 三个 Task 专业只读 Tab 增加固定容量的 Worker 读取执行边界，避免同步 `DatabaseSync` 在主 event loop 中累积阻塞。

## 背景与问题

development、reviews、verification 已经分别读取自己的 Application current record 与 Finish 写入关联，但 HTTP handler 中的同步 read model 调用仍运行在主 Node 线程。并发打开多个 Tab 时，慢读取会阻塞后续请求；仅使用 `async` 函数并不能改变这一事实。

## 目标与非目标

目标是用固定容量、有限 FIFO 队列、取消和错误传播把三个只读 Tab 的阻塞工作移出主 event loop，并以调用次数、最大并发、队列和取消测试证明边界。非目标是改变 Task/Review/Verification/Finish authority、增加数据库、改变 Structured Store 写入边界或迁移写入与 Git 校验。

## 关键变化

- Local App server 拥有一个固定容量 read executor，默认 2 个 long-lived Worker 与 32 个排队槽位。
- Worker 只接受 development、reviews、verification 三个白名单 read operation。
- 队列满、请求取消、Worker failure 与 server close 都有稳定结算，不伪造空 read model，不重试已取消读取。
- 已解析 canonical root 的只读调用保持无 Git/worktree provenance 与 `git rev-parse`；写入、Environment、worktree、Finish、Doctor 保持原有校验。

## 影响与风险

Worker pool 会增加 Local App 的固定内存和启动成本；取消不能中断已经进入同步 SQLite 调用的瞬间，只保证不交付、不重试和释放容量。队列满时返回可重试的稳定 503 diagnostic。

## 验收摘要

通过 Integration/System 测试证明固定并发上限、有限队列、一次派发、取消、错误传播、三个 Tab 独立失败与现有 no-Git/no-terminal-aggregate 边界。

## 技术入口

- `openspec/changes/local-app-bounded-read-execution/design.md`
- `openspec/changes/local-app-bounded-read-execution/specs/bounded-local-app-read-execution/spec.md`
