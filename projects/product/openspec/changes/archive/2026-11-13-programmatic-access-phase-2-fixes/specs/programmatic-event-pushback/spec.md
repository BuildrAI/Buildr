## MODIFIED Requirements

### Requirement: 五类事件与内容
系统 SHALL 仅回推 `decision.requested`、`run.completed`、`run.failed`、`run.stopped`、`run.stalled` 五类事件。`decision.requested` MUST 在出现提问卡片或审批请求时产生；`run.completed`/`run.failed` MUST 在一轮执行完成/失败时产生；`run.stopped` MUST 在执行被停止且停止非由该凭据发起时产生；`run.stalled` MUST 在执行出现 fault 或状态 unknown 连续 5 分钟时产生。工具调用、流式片段、思考、中间消息、starting/running 状态切换、标题生成 MUST NOT 推送。每条事件 MUST 含 eventId（全局唯一）、type、occurredAt、machine（id 为本机稳定标识、name 为主机名）、workspaceId、conversationId、title、runId、runStatus、summary（最多 500 字；completed 取最终回复摘要、failed 取诊断信息）、detailUrl（该对话的程序接入 read 地址）；`request`（requestId、kind、title、options）MUST 仅在 decision.requested 提供。事件 MUST NOT 携带任何密钥或完整对话内容。回推设置停用（state=disabled）MUST NOT 停止上述五类事件写入持久事件流，只停止对外投递；这些事件 MUST 标记为未投递并可由 events 补查；重新启用后 MUST NOT 重放停用期间已记录的事件。

#### Scenario: 决策事件
- **WHEN** 已接手对话出现新的提问卡片或审批请求
- **THEN** 系统 MUST 推送 decision.requested，含准确 requestId、kind、title、options，不含完整正文

#### Scenario: 停止归属
- **WHEN** 执行被停止且停止由该凭据自身发起
- **THEN** 系统 MUST NOT 向该凭据推送 run.stopped；由其他来源停止时 MUST 推送

#### Scenario: 卡住判定
- **WHEN** 已接手对话的执行出现 fault，或状态 unknown 连续达到 5 分钟
- **THEN** 系统 MUST 推送 run.stalled；重启后 MUST 按持久化时间重新判定，不重复误报

#### Scenario: 不推过程
- **WHEN** 执行产生工具调用、流式片段、思考、中间消息或 starting/running 切换、标题生成
- **THEN** 系统 MUST NOT 推送任何事件

#### Scenario: 停用仍记录
- **WHEN** 凭据回推设置为 disabled 且已接手对话产生五类事件之一
- **THEN** 系统 MUST 将事件写入同一持久事件流并标记为未投递，MUST NOT 对外投递
- **AND** events 补查 MUST 能返回这些事件；重新启用后 MUST NOT 重放

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
