## RENAMED Requirements

- FROM: `### Requirement: 五类事件与内容`
- TO: `### Requirement: 六类事件与内容`

## MODIFIED Requirements

### Requirement: 六类事件与内容
系统 SHALL 回推 `decision.requested`、`run.progress`、`run.completed`、`run.failed`、`run.stopped`、`run.stalled` 六类业务事件。`decision.requested` MUST 在出现提问卡片或审批请求时产生；`run.progress` MUST 在新的 assistant 中间消息出现时按 run 合并产生；`run.completed`/`run.failed` MUST 在一轮执行完成/失败时产生；`run.stopped` MUST 在执行被停止且停止非由该凭据发起时产生；`run.stalled` MUST 在 starting/running/tools-active 连续 20 分钟没有任何新消息、工具调用或状态变化时产生一次，恢复后重新计时。工具调用明细、流式 token、思考、starting/running 状态切换、标题生成 MUST NOT 单独推送。

每条事件 MUST 含 eventId（全局唯一）、type、occurredAt、machine（id 为本机稳定标识、name 为主机名）、workspaceId、conversationId、title、runId、runStatus、summary（最多 500 字）、detailUrl（该对话的程序接入 read 地址）、scopes（事件生成时当前凭据权限）与 allowFullAccess（当前凭据全部授权执行开关）。`run.completed`、`run.failed`、`run.stopped` MUST 含该 run 最终 assistant 回复的完整文本 `finalReply`（不截断）和只返回该回复的 `finalReplyUrl`。`decision.requested` MUST 含 requestId、kind、title、description、runId、participantId、generation、conversationRevision 和卡片全部内容；审批 options 与问题 questions 内选项 MUST 使用 optionId、label、description，问题项 MUST 使用 questionId、question、allowOther、multiple。`run.progress` MUST 含 progress.text（最新中间消息全文）、progress.elapsedMs、progress.completedToolCount；同一 run 相邻推送 MUST 至少间隔 5 分钟，间隔内只保留最新一条。`run.stalled` MUST 含 stalled.idleMs 与 stalled.lastActivityAt。事件 MUST NOT 携带任何密钥或接收地址。

回推设置停用（state=disabled）MUST NOT 停止已开启事件写入持久事件流，只停止对外投递；这些事件 MUST 标记为未投递并可由 events 补查；重新启用后 MUST NOT 重放。中间进度或停滞提醒单独关闭时，系统 MUST NOT 生成对应事件。

#### Scenario: 决策事件
- **WHEN** 已接手对话出现新的提问卡片或审批请求
- **THEN** 系统 MUST 推送 decision.requested，含全部问题/选项及回答所需身份和对话 revision

#### Scenario: 完整终态回复
- **WHEN** run 达到 completed、failed 或 stopped
- **THEN** 事件 MUST 含完整 finalReply 与 finalReplyUrl；接收方 GET finalReplyUrl 且具备 read 权限时 MUST 只返回该 run 的 runId 与 finalReply

#### Scenario: 中间进度节流
- **WHEN** run 产生新的 assistant 中间消息
- **THEN** 系统 MUST 在满足五分钟间隔时推送 run.progress，间隔内只保留最新一条并在窗口结束推送

#### Scenario: 卡住判定
- **WHEN** run 处于 starting/running/tools-active 且连续二十分钟无新记录
- **THEN** 系统 MUST 推送一次 run.stalled；新记录恢复后 MUST 重置，再次连续二十分钟空闲才会再推

#### Scenario: 不推过程
- **WHEN** 执行只产生工具调用明细、流式 token、思考、starting/running 状态切换或标题生成
- **THEN** 系统 MUST NOT 因这些变化单独推送事件；assistant 中间消息按 run.progress 规则处理

#### Scenario: 停止归属
- **WHEN** 执行被停止且停止由该凭据自身发起
- **THEN** 系统 MUST NOT 向该凭据推送 run.stopped；由其他来源停止时 MUST 推送

#### Scenario: 停用仍记录
- **WHEN** 凭据回推设置为 disabled 且已开启事件类型之一产生
- **THEN** 系统 MUST 将事件写入同一持久事件流并标记为未投递，MUST NOT 对外投递；events 补查 MUST 能返回这些事件，重新启用后 MUST NOT 重放

#### Scenario: 新事件开关
- **WHEN** 凭据回推设置关闭中间进度或停滞提醒
- **THEN** 系统 MUST NOT 生成对应 run.progress 或 run.stalled，其他事件不受影响
