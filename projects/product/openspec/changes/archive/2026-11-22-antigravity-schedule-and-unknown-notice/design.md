## Context

在一次使用 Antigravity（`full-access` 模式）排查 DeepSeek Harness 的真实对话中，智能体在启动应用后调用原生 `schedule` 工具（定时 8 秒后验证进程与端口）并输出提示后等待定时器触发，`agy acp` 返回 `stopReason: "end_turn"`。虽然原生定时器在 8 秒后正常唤醒并开始执行验证命令，但 Buildr 侧的四处缺陷叠加导致会话被卡死并误导用户：

1. `antigravity/index.ts` 只认定 `tool.label === 'command'` 属于后台任务，把 `Run schedule` 当成缺失回执的普通工具置为 `unknown`；
2. 轮次成为 `unknown` 后，前端自动触发 `observe` → `ConversationApplication.reconcile` 未传 `permissionMode` 调用 `resumeContext`，协调器因键值从 `full-access` 变为 `default` 发 `owner-dispose` 杀掉了正在运行的原生进程；
3. `ConversationExecutionNotice` 与 `conversationObservationFeedback` 对未释放 `unknown` 轮忽略了 `run.diagnostic`，只渲染固定文案“暂时无法读取执行状态”或误导的“可发送新要求”；
4. 用户尝试补发消息时被路由到 `supplement`，但因 `observed.status === 'unknown'` 被拒，且 `ConversationSupplements` 丢弃了 `observed.diagnostic`，没有告知真实原因和“先点停止再发送”的解锁路径。

## Goals / Non-Goals

**Goals:**
- `Run schedule` 等原生定时/异步等待工具在 `end_turn` 时继续维持 `backgroundWork: true` 和 `running` 状态，不产生误报提示，并能在等待期间接受执行中追加。
- 定时/后台等待到期时，无论来自 ACP `tool_call_update` 还是原生 `transcript_full.jsonl` 中的 `Timer`/`Cron` 系统触发记录，都能在同一原生会话自动续行把结果交回模型。
- `reconcile` 核对状态时透传 `permissionMode`，且 `AntigravityRuntime.resumeContext` 同时保护 `activeTurn.backgroundWork`，杜绝核对过程误杀活跃进程。
- 对真正发生异常而进入未释放 `unknown` 的轮次，前端状态条、重新读取反馈和追加拒绝提示都直接显示可读的真实诊断与清晰可操作指引（先停止再发送），无可读诊断时保留温和兜底。

**Non-Goals:**
- 不将 `read`、`edit` 等非后台工具纳入后台等待集合；这些工具若缺失回执仍须严格进入 `unknown` 保护现场。
- 不改变其他执行器（Codex/DSH/Qoder/Claude）的续行机制，也不放宽“不自动另开会话、不自动重放”的安全契约。

## Decisions

1. **受控扩展后台工具集合与双路回执观察**
   - 在 `antigravity/index.ts` 定义明确的后台工具集合 `ANTIGRAVITY_BACKGROUND_TOOL_LABELS = new Set(['command', 'Run schedule', 'schedule', 'Run run_workflow', 'run_workflow'])`；`read`/`edit` 等常规工具继续严格要求同步回执。
   - 在 `antigravity/content.ts` 保留 `readAntigravityCommandExits` 原实现不变，新增 `readAntigravityScheduleTriggers` 解析 `transcript_full.jsonl` 中 `Timer:` / `Cron:` 任务与对应 `SYSTEM_MESSAGE` 触发消息，并按与命令完全一致的 `Prompt` + `taskCreatedAt` 归属规则匹配 `running` 的定时工具。
   - 当只有定时/非命令后台工具触发续行时，生成语义准确的内部续行提示（保留 `ANTIGRAVITY_CONTINUATION_MARKER` 前缀，不进入用户可见历史）。

2. **核对重连保留权限模式并保护活动后台轮次**
   - `ConversationApplication.reconcile` 调用 `runtime.resumeContext` 时附带 `savedRun?.permissionMode`。
   - `AntigravityRuntime.resumeContext` 将阻塞保护条件从 `activeTurn?.pending` 扩展为 `activeTurn?.pending || activeTurn?.backgroundWork`，使定时或后台等待期间的只读观察不会触发重连或权限降级关闭。

3. **抽离纯辅助 `conversationLiveUnknownReason` 统一展示真实诊断**
   - 在 `conversation-notices.ts` 新增 `conversationLiveUnknownReason(diagnostic?, streamError?)`：优先提取包含可读中文的 `diagnostic` 或 `streamError`，并对已知内部代码（如 `qoder_late_native_activity`）映射可读中文；仅在完全没有可读说明时返回 `undefined`，使 `ConversationExecutionNotice` 回退显示 `'暂时无法读取执行状态'`（保证既有无诊断场景测试和契约不变）。
   - 未释放 `unknown` 轮一旦有可读诊断，即在状态条使用可换行的 `.ac-execution-uncertain-reason` 类直接完整呈现；在 `conversationObservationFeedback` 中则如实说明该诊断并提醒点击“停止”后再继续，彻底移除“可发送新要求”的误导表述。

4. **执行中追加受阻时透出真实诊断与可操作指引**
   - `ConversationSupplements.execute` 在 `observed` 拒绝路径读取 `observed.diagnostic`，若包含可读中文诊断则附带在拒绝消息中（如 `原执行状态待确认（...），暂不能向原轮追加；输入已保留，不会另开会话。可先点击“停止”结束本轮后再发送。`），既坚守不另开会话、不重放的边界，又让用户明确知道当前怎么回事、下一步点哪里。

## Risks / Trade-offs

- **定时器在底层原生自动唤醒与 Buildr 续行的配合**：若 `agy` 在同一进程收到 `SYSTEM_MESSAGE` 唤醒后自行推进并产出新步骤，`schedule` 工具完成回执经 ACP 推送后会进入 `observeBackgroundWork`/`handleTurnUpdate`。目前 `antigravity/index.ts` 通过 `scheduleBackgroundContinuation` 仅在 `!turn.pending && turn.backgroundWork && turn.stopReason === 'end_turn'` 时触发续行；保持同一串行锁控与 `ANTIGRAVITY_CONTINUATION_MARKER` 可防止重复发散，同时在无工具运行中时正常收敛。
- **不破坏既有未知提示测试**：原有无 `diagnostic` 的测试仍期望 `'暂时无法读取执行状态'` 与 `'仍无法读取原执行状态'`，通过 `conversationLiveUnknownReason` 仅在存在真实可读原因时覆盖默认兜底，两者完全兼容。
