## MODIFIED Requirements

### Requirement: 列表查询优化
系统 SHALL 在 `GET /api/v1/programmatic/workspaces/{workspaceId}/conversations` 支持 `active=true`（仅返回活动中的对话：有待决请求、仍有执行中或未释放的工作，或产生尚未查看的新结果；已完成但未查看的对话属于 active）、`attention=true`（仅返回有待决请求、当前执行失败或状态 unknown 的对话；单纯已完成但未查看不属于 attention）、`fields=summary`（每个对话仅返回 id、title、runStatus、updatedAt、active、pendingDecisionCount）。返回 MUST 固定带 activityCounts；`activityCounts.active` MUST 等于同一工作空间范围内 `active=true` 的对话总数，`activityCounts.attention` MUST 等于同一范围内 `attention=true` 的对话总数；limit MUST 只限制返回页。

#### Scenario: 过滤与投影
- **WHEN** 程序携带 active=true 或 attention=true 或 fields=summary 查询列表
- **THEN** 系统 MUST 按参数过滤或投影，固定返回 activityCounts，且 limit 只限制返回页
- **AND** activityCounts.active MUST 与 active=true 的总数一致，activityCounts.attention MUST 与 attention=true 的总数一致
- **AND** 已完成但未查看的对话 MUST 计入 active，MUST NOT 计入 attention

### Requirement: 单步续聊
系统 SHALL 提供 `POST /api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/messages`（execute 权限），请求体 text（必填）、clientRequestId（必填）、expectedRevision（可选）、permissionMode（可选，default 或 full-access）。服务端 MUST 内部完成 prepare-send 和 send，沿用对话原连接和模型，返回 202 和 runId。省略 permissionMode 时 MUST 沿用该对话最近一轮执行的 permissionMode；没有最近轮次时 MUST 使用 default。显式 full-access MUST 与 send 使用同一凭据 allowFullAccess 门禁，关闭时 MUST 返回 403 programmatic_forbidden。幂等规则 MUST 与现有 send 相同；对话正在运行或修订不一致 MUST 返回 409。

#### Scenario: 单步续聊成功
- **WHEN** 程序对空闲对话提交合法 text 与 clientRequestId
- **THEN** 系统 MUST 内部完成 prepare-send+send，沿用原连接与模型，返回 202 与 runId

#### Scenario: 幂等与冲突
- **WHEN** 同一 clientRequestId 重试，或对话正在运行，或 expectedRevision 不一致
- **THEN** 相同输入重试 MUST 复用原执行不新建工作；运行中或修订不一致 MUST 返回 409

#### Scenario: 权限模式继承与门禁
- **WHEN** 对话最近一轮为 full-access，程序省略 permissionMode 提交 messages
- **THEN** 新执行 MUST 继续使用 full-access
- **AND** 显式请求 full-access 且凭据关闭 allowFullAccess 时 MUST 返回 403 programmatic_forbidden
