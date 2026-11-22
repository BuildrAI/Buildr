## Why

在 Antigravity 对话中调用原生 `schedule` 定时器等待后台检查时，Buildr 存在四项叠加缺陷：

1. Antigravity 执行器仅将 `command` 视作后台工具，导致调用 `Run schedule`（以及 `run_workflow`）并结束文本回复等待唤醒时被误判为“正文已结束但仍有工具缺少完成回执”，提前进入 `unknown`；
2. 进入 `unknown` 后自动或手动 `observe` 在 `reconcile` 阶段调用 `runtime.resumeContext` 时未透传原轮 `permissionMode`，导致系统把 `full-access` 进程当作 `'default'` 重建并主动关停仍在运行的原生进程；
3. 前端 `ConversationExecutionNotice` 与 `conversationObservationFeedback` 对尚未释放的 `unknown` 轮忽略已有可读 `diagnostic`，硬编码显示“暂时无法读取执行状态”或误导性提示“可发送新要求”，使用户无法判断真实状况；
4. 因原轮未释放且处于 `unknown`，前端将后续消息路由到执行中追加并被拒绝，同时 `ConversationSupplements` 吞掉了 `observed.diagnostic`，未向用户透出真实阻塞原因及“先停止再发送”的可操作路径。

## What Changes

- **Antigravity 定时与后台工具识别**：扩展 Antigravity 后台工具识别集合至 `Run schedule` / `schedule`（及 `Run run_workflow` / `run_workflow`），新增从原生 `transcript_full.jsonl` 读取 `Timer` / `Cron` 唤醒回执的 `readAntigravityScheduleTriggers`，在等待期间保持 `status: 'running'` 与 `backgroundWork: true`，支持等待期间执行中追加，并在 ACP 完成更新或转录触发时自动续行交回模型；同时在 `resumeContext` 中同时保护 `activeTurn.backgroundWork`。
- **核对重连透传权限模式**：`ConversationApplication.reconcile` 在调用 `runtime.resumeContext` 时透传 `savedRun?.permissionMode`，防止因权限模式缺失关闭正在运行的 `full-access` 原生进程。
- **未释放未知状态如实提示**：新增 `conversationLiveUnknownReason`，在 `ConversationExecutionNotice` 与 `conversationObservationFeedback` 中优先直接展现真实可读诊断（仅在无可读诊断时才回落到“暂时无法读取执行状态”），且未释放 `unknown` 反馈引导用户点击“停止”后再继续而不宣称“可直接发送”。
- **追加受阻透出真实原因与指引**：`ConversationSupplements` 在观测到 `unknown` 拒绝追加时，若存在可读诊断则在错误提示中直接呈现原因，并明确指引可点击“停止”结束本轮后再发送（保留不另开会话的安全性）。

## Capabilities

### Modified Capabilities
- `antigravity-cli-execution`: 扩展后台任务与定时等待识别、转录唤醒兜底、权限模式一致的重连保护与等待期间追加能力。
- `agent-conversations`: 完善未释放 `unknown` 状态的真实原因可见提示、重新读取反馈及追加被拒时的可操作原因透出。

## Impact

- 影响服务：`buildr-harness`、`buildr-harness-web`。
- 非目标：不改动 Codex / DSH / Qoder / Claude 的续行策略；不放开在未释放 `unknown` 轮上自动另开会话或绕过 `stop` 的安全约束；不改动历史会话文件或数据库结构。
