## Why

四小时候选版发布中，接收方只靠事件回推无法掌握长任务进展，必须每 20 秒轮询；同时终态事件缺少完整最终回复，决策卡缺少完整问题与回答身份，权限说明也与实际凭据不一致。需要让回推本身成为可独立观察和回答的完整通道。

## What Changes

- `run.completed`、`run.failed`、`run.stopped` 携带完整 `finalReply` 与轻量 `finalReplyUrl`；新增 read 权限的最终回复读取接口。
- `decision.requested` 携带全部问题、选项及回答所需 `requestId`、`runId`、`participantId`、`generation`、对话 revision。
- 新增 `run.progress` 与 `run.stalled`；分别按 run 五分钟合并最新中间消息，以及运行中连续二十分钟无记录时提醒一次。
- 新事件计入现有 180/小时、20/分钟限流，默认开启并可在凭据回推设置中分别关闭。
- 每条业务事件携带事件生成时的凭据 `scopes` 与 `allowFullAccess`；权限说明以发现入口为准。
- 同步 `/help`、`/operations`、OpenAPI、运行时技能说明和测试。

## Impact

- 程序接入接收方可直接获取长任务进度、停滞提醒、完整终态回复和完整决策卡，不再依赖短轮询。
- 保持原有按凭据接管、持久事件流、补查、限流合并、退避和停用语义。
- 不新增程序凭据管理权限；最终回复接口仅需 read 和路径工作空间授权。
