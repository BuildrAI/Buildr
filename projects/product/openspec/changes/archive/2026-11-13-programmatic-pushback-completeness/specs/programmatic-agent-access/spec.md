## ADDED Requirements

### Requirement: 最终回复轻量读取
系统 SHALL 提供 `GET /api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/runs/{runId}/final-reply`（read 权限及路径工作空间授权）。响应 MUST 只包含 `runId` 与该 run 最后一条可见 assistant 回复的完整 `finalReply`，MUST NOT 返回完整对话。run 不存在且没有该 run 的消息记录时 MUST 返回 404 agent_run_missing。

#### Scenario: 读取终态回复
- **WHEN** 接收方收到带 finalReplyUrl 的终态事件并 GET 该地址
- **THEN** 系统 MUST 返回 {runId,finalReply}，正文不截断，不附带完整对话

#### Scenario: 未知执行
- **WHEN** runId 不属于该对话且没有对应消息
- **THEN** 系统 MUST 返回 404 agent_run_missing

### Requirement: 回推权限说明
程序文档 MUST 说明当前凭据的实际权限以发现入口返回的 `credential.scopes` 和各 capability 的 scope 为准，MUST NOT 用产品名或示例推断固定权限。每条回推 payload MUST 携带事件生成时当前凭据的 `scopes` 与 `allowFullAccess`。

#### Scenario: 权限快照
- **WHEN** 宿主为凭据产生回推事件
- **THEN** payload MUST 含最近一次观察的 scopes 与 allowFullAccess
