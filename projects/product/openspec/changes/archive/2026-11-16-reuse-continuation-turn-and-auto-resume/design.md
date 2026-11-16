## Context

当前系统中：
1. 每次手动继续、自动重试或服务重启自动恢复都会产生一条 `kind: 'notice', role: 'system'` 条目（例如“已请求继续上次执行。”或“已自动接续上次工作。”），并在 `ConversationStream` 中由于拥有独立 `runId` 而新建一个 `ConversationTurn`。前端通过 `continuedFrom.prompt` 渲染“继续上次要求”用户气泡，造成同页内出现连续重复气泡。
2. 服务端 `releaseRetiredWork()` 与 `releaseIdleSources()` 把在途执行状态落为 `unknown` 却未写入 `interruption` 标记；另外 `adoptParallel()` 启动新代次时，旧代次此时仍在释放中，新代次启动的 `recoverInterrupted()` 仅扫描一次，等旧代次释放并退出后不再触发恢复，且 `recoverRun()` 要求 `run.generation === this.options.generation` 才放行自动恢复。

## Goals / Non-Goals

**Goals:**

- 当同一原始用户输入（同一 `userEntryId`）对应的回合或接续回合已在当前可见流时，将后续接续通知、交接诊断、过程块与最终回复并入同一 `ConversationTurn`，不重复渲染用户气泡或“继续上次要求”头部。
- 服务退休退出、空闲释放与并行换代场景下，只要满足安全释放与自动恢复条件，新代次自动完成中断恢复与原目标接续，不要求用户手动点“继续原任务”。
- 保留跨分页源输入不可见时的头部只读快照呈现能力以及未知工具/历史记录的原样保存。

**Non-Goals:**

- 不改变历史持久存储中的条目顺序与不可变分页游标语义。
- 不放松用户主动停止、待决提问/授权、旧代次仍存活或账号失配的保护门禁。

## Decisions

### 1. 基于 `entry.continuedFrom` 与读取模型 `continuationLinks` 进行精确归属复用

- 在 `ConversationEntry` 增加可选只读轻量字段 `continuedFrom?: { runId: string; userEntryId: string }`，由服务端在创建接续通知和投影视图时填充，仅含两个 ID，不附带正文快照，避免扩大条目存储与网络传输。
- 读取模型 `ConversationReadModel` 升级至 `continuationVersion: 2`，在头表保存全量尝试链的 `continuationLinks`，保障已结算的历史接续轮在新增多轮对话或重启后仍可准确合并到原交互回合。
- 前端 `conversationStreamTurns` 通过 `continuedFrom.runId` / `continuedFrom.userEntryId` 匹配既有回合，实现有界、不猜测的跨执行归并；`finalConversationReplyIds` 仅将交互链最后一个已结算执行的尾段助手回复标为正式答复，中间中断轮叙述收纳至可折叠过程块；`conversationTurnTiming` 在接续轮运行中以最新活跃执行为起止计时，在已结算后汇总本交互时间；`conversationTurnExpansionKey` 以末段执行 `runId` 作为展开键保持切换稳定。

### 2. 退休中断打标、代次释放条件放行与 peer 退出自动重扫

- 在 `releaseRetiredWork` 和 `releaseIdleSources` 将未完成、未请求停止的活跃执行转为 `unknown` 时持久记录 `record.interruption`（并修正 `tools-active` 无待决请求时误标 `awaitingUser` 的边界）。
- `recoverRun` 允许在 `run.generation !== this.options.generation` 但 `released && !this.options.generationAlive?.(run.generation)` 时确认旧所有者已退出并允许接续。
- 在 `server.ts` 轮询中跟踪并观察存活的 peer 代次集合：当任意先前观察到的 peer 退出时触发 `recoverAfterHostAttach()`，确保并行平滑换代后不漏恢复。

## Risks / Trade-offs

- [多轮合并后展开键或过程折叠变化] → 使用末段执行 `runId` 作为展开键并在结算回调中保持同步，保证流式运行中与结算后展开状态一致。
- [旧数据库升级期间的读模型重建] → `continuationVersion` 升级为 `2` 后触发异步/同步读模型重建，在重建完成前通过 `attempts` 实时派生 `continuationLinks` 兜底，不影响读写可用性。
