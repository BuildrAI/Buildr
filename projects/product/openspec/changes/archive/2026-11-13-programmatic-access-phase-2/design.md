## Context

对话 Application 与事件扇出（`ConversationEvents`）位于独立进程内的 `@buildr-ai/buildr-agent`；程序接入凭据与 HTTP 管理面位于 `services/buildr`，经 `AgentOperations` IPC 调用门面。现有全局 Webhook（`ConversationWebhooks` + `WebhookJournal` + `WebhookManagement`）已证明"视图差分→持久日志→退避投递"模式可行，但其语义（七类事件、全局单配置、无限重试、1s×2^n 退避）与本期要求差异显著。

## Goals / Non-Goals

Goals：按凭据隔离推送、五类精确事件、速率限制与合并、有界重试、7 天持久化与序号补查、测试隔离、配置迁移；列表与单步续聊优化；文档同步。

Non-Goals：不改变网页会话认证与执行权限边界；不引入恰好一次投递承诺；不保留全局七类 Webhook 的对外发送；不做发布。

## Decisions

### 回推子系统归属与进程接线
回推 Application、日志与配置存储放在 `buildr-agent`，作为 `ConversationEvents` 的新扇出目标取代全局 `webhooks`。事件差分与投递在进程内完成，避免高频对话视图跨 IPC。配置管理、接手标记、事件补查经门面 `pushback` 命名空间暴露，按现有 `webhooks` 模式接入 `process/operations.ts`（方法白名单+输入 schema）、`process/client.ts`（通用代理）与 `operation-schemas.ts`。`credentialId` 对 buildr-agent 是不透明键，凭据语义仍由 buildr 拥有。

### 配置与密钥
每凭据回推配置（url、enabled、rateLimitHour、rateLimitMinute、revision、secretFilePath）存于 buildr-agent 私有 SQLite；密钥明文存于实例私有目录 600 文件（目录 700，O_NOFOLLOW、私有权限与 uid 校验，复用 `webhook-settings.ts` 模式）。普通读取不返回密钥；reveal 经版本校验独立返回明文且禁缓存；日志与事件正文对密钥/地址脱敏。空密钥输入保留原值，首次启用缺密钥拒绝。

### 接手标记与停止归属
buildr 程序接入 HTTP 在 `start`/`send`/`supplement`（含单步续聊内部 send）成功后调用 `pushback.markTakeover(workspaceId, conversationId, credentialId)`，持久化 (workspace, conversation, credential) 首次接手时间。回推仅对带该凭据标记的对话产事件。`stop` 操作记录发起凭据到 run；`run.stopped` 对发起停止的凭据抑制。

### 事件映射
复用视图差分思路新增 `programmatic-pushback-notifications` 域函数，从 `ConversationView` 与 prior snapshot 产五类事件：新 question/approval 请求→`decision.requested`；run 达 completed/failed→`run.completed`/`run.failed`；run 达 stopped 且非本凭据发起→`run.stopped`；fault 或 unknown 连续 5 分钟→`run.stalled`（由周期检查触发）。事件含 eventId（全局唯一）、type、occurredAt、machine{id=实例稳定标识,name=hostname}、workspaceId、conversationId、title、runId、runStatus、request（仅 decision.requested）、summary（≤500 字）、detailUrl（程序接入 read 地址）。不含密钥与完整正文。

### 速率限制与合并
每凭据滑动窗口计数（小时/分钟）。未超限立即入队投递；超限后同 (conversation,type) 合并为一条（保留最新状态与 mergedCount），额度恢复后发出；`decision.requested` 优先且不合并。合并与限速状态持久化，重启不丢。

### 投递与持久化
HTTP POST JSON，一请求一事件，Bearer 密钥，禁重定向、5 秒超时、2xx 成功。失败按 10/30/90/270/810 秒退避，最多 5 次，仍失败标记 undelivered 并记录。事件日志按凭据全局序号升序，保留 7 天，重启序号连续。`events` 补查按 after 游标升序返回该凭据可见事件含未送达；丢弃（超保留期或容量）时补发 `events_dropped`。

### 列表与单步续聊
列表 Application 增加 active/attention/fields=summary 过滤与投影，固定带 activityCounts，limit 生效；复用仓储 `querySummaries` 的 activity 分类。单步续聊 `messages` 在 buildr HTTP 层内部串联 prepareSend+send（沿用原连接与模型），返回 202+runId；幂等与 409 规则同 send。

### 迁移与全局通知退役
启动时 buildr 读取既有全局 Webhook 配置（url+secret），若存在且未迁移，则写入 GrokBot 凭据回推配置并置 enabled=false，记录迁移完成标记。移除全局事件通知 UI 页签、管理路由与 CLI 重放；`ConversationEvents` 不再扇出到全局 webhooks。`outbound-conversation-webhooks` 能力退役。

## Risks / Trade-offs

- 移除全局 Webhook 管理面与引擎为破坏性变更，需同步更新相关测试与文档；既有全局配置仅迁移不丢弃。
- 跨进程配置管理依赖门面接线一致性，需覆盖 operations 白名单与 schema。
- `run.stalled` 的 unknown 连续 5 分钟需周期检查，重启后按持久化时间重新判定，避免误报。
- 测试隔离：投递 transport 在测试/候选环境注入本地假接收端，禁止真实地址。

## Migration Plan

1. 新增回推子系统与门面接线，保留旧全局引擎代码直至扇出切换。
2. 切换扇出到回推，移除全局管理面与 UI 页签。
3. 启动迁移既有全局配置到 GrokBot 凭据（停用），幂等。
4. 更新/替换相关测试与文档，contractVersion 变化。