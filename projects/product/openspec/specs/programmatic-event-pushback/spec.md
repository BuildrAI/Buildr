# programmatic-event-pushback Specification

## Purpose
按程序接入凭据回推对话关键事件：以接手标记隔离推送范围，仅推五类决策与执行终态事件，施加速率限制与合并、有界退避投递和持久化补查，并取代退役的全局单向通知。

## Requirements

### Requirement: 按凭据接手标记与推送范围
系统 SHALL 在对话第一次被某程序凭据通过 API 新建、发送、续发或补充时，持久标记该对话"已由该凭据接手"。回推 MUST 仅推送带该凭据接手标记的对话；从未被该凭据接触过的对话 MUST NOT 推送。接手标记 MUST 按 (工作空间, 对话, 凭据) 持久保存，重启后保留。

#### Scenario: 首次接手
- **WHEN** 某凭据首次通过 API 对一对话执行新建、发送、续发或补充
- **THEN** 系统 MUST 持久记录该凭据对该对话的接手标记，此后该对话的相关事件 MAY 向该凭据回推

#### Scenario: 未接手不推
- **WHEN** 一对话从未被某凭据通过 API 接触
- **THEN** 系统 MUST NOT 向该凭据推送该对话的任何事件

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

### Requirement: 速率限制与合并
系统 SHALL 对每个凭据施加可配置的速率限制，默认每小时 180 次、每分钟 20 次，并允许在界面修改。未超限时事件 MUST 立即推送，不做等待。超限后同一对话同类事件 MUST 合并为一条（保留最新状态与合并条数），在额度恢复后发出；`decision.requested` MUST 优先发出且不被合并。

#### Scenario: 未超限立即推
- **WHEN** 凭据当前小时与分钟计数均未超限
- **THEN** 事件 MUST 立即入队投递，不等待

#### Scenario: 超限合并
- **WHEN** 凭据超限且同一对话产生多条同类事件
- **THEN** 系统 MUST 合并为一条并保留最新状态与合并条数，额度恢复后发出；decision.requested MUST 不被合并且优先发出

### Requirement: 有界退避投递
系统 SHALL 以 HTTP POST JSON 投递，一个请求一个事件，接收方返回 2xx 算成功。失败 MUST 按 10 秒、30 秒、90 秒、270 秒、810 秒指数退避重试，最多 5 次；仍失败 MUST 标记为未送达并记录。投递 MUST 禁止重定向、5 秒超时，密钥以 Bearer 携带，日志与事件正文 MUST NOT 输出密钥明文。

#### Scenario: 重试与未送达
- **WHEN** 接收端非 2xx、断线或超时
- **THEN** 系统 MUST 以原 eventId 按 10/30/90/270/810 秒退避重试最多 5 次，仍失败标记未送达并记录，不重做原业务动作

### Requirement: 持久化与序号补查
系统 SHALL 持久保存事件 7 天，服务重启后序号连续。系统 SHALL 提供 `GET /api/v1/programmatic/workspaces/{workspaceId}/events?after={cursor}&limit={n}`（read 权限，limit 默认 50、最大 200），按序号升序返回该凭据可见的事件，含未送达事件。`after` MUST 为上一页 nextCursor 返回的非负整数序号；不是合法游标时 MUST 返回 400 programmatic_input_invalid。`nextCursor` MUST 始终返回本页最后一条事件的 sequence 字符串；本页为空时 MUST 返回请求中的 after；未传 after 且没有任何事件时 MUST 为 null。响应 MUST 包含布尔字段 `hasMore`，表示以 `after=nextCursor` 再次读取时是否还有更多事件。轮询方 MUST 保存 `nextCursor` 并用 `after=nextCursor` 继续补查。事件被丢弃时系统 MUST 补发 `events_dropped`。

#### Scenario: 重启序号连续
- **WHEN** 服务重启后继续产生事件
- **THEN** 序号 MUST 接续重启前的最大值，不重置

#### Scenario: 补查含未送达
- **WHEN** 凭据以 after 游标读取 events
- **THEN** 系统 MUST 按序号升序返回该凭据可见事件（含未送达），limit 默认 50、最大 200

#### Scenario: 末尾仍可续读
- **WHEN** 本页包含事件且已到当前流末尾
- **THEN** nextCursor MUST 为本页最后一条事件的 sequence 字符串，hasMore MUST 为 false

#### Scenario: 空页回显游标
- **WHEN** 请求带 after 且该游标之后没有事件
- **THEN** events MUST 为空数组，nextCursor MUST 等于请求的 after，hasMore MUST 为 false

#### Scenario: 无事件首次读取
- **WHEN** 请求未带 after 且该凭据在此工作空间没有任何事件
- **THEN** events MUST 为空数组，nextCursor MUST 为 null，hasMore MUST 为 false

#### Scenario: 非法游标
- **WHEN** 请求的 after 不是非负整数序号
- **THEN** 系统 MUST 返回 400 programmatic_input_invalid，MUST NOT 当作 0 静默补查

### Requirement: 测试与候选隔离
测试环境、候选实例和自动化测试 MUST NOT 向真实接收地址推送；测试 MUST 仅使用本地假接收端。

#### Scenario: 自动化测试
- **WHEN** 自动化测试或候选实例验证回推
- **THEN** 投递 MUST 指向本地假接收端，MUST NOT 触达真实接收地址

### Requirement: 配置迁移与全局通知退役
系统 SHALL 将既有全局事件通知的接收地址与密钥迁移到 GrokBot 凭据（id `fb4ffb88-9fc6-48b1-b4d7-4fe98bb7c4a3`）的回推设置下，迁移后 MUST 保持停用。系统 SHALL 移除全局「事件通知」页签与其管理面，全局七类 Webhook 发送 MUST 由按凭据回推取代。迁移 MUST 幂等，不丢弃既有配置。

#### Scenario: 迁移停用
- **WHEN** 存在既有全局事件通知配置且尚未迁移
- **THEN** 系统 MUST 将其地址与密钥写入 GrokBot 凭据回推设置并置为停用，记录迁移完成，重复启动不重复迁移
