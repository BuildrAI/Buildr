## Why

第一期程序接入已上线，外部程序（GrokBot）只能轮询对话状态，效率低且无法及时响应提问与审批。现有「事件通知 / Webhook」是全局单一配置，推送七类宽泛事件，无法按凭据隔离推送范围，也不满足程序接入对速率、合并、补查和测试隔离的要求。本期把事件回推收敛到每个程序接入凭据下，并优化列表查询与续聊，使外部程序能以最小轮询完成"收到决策→读对话→单步续聊"的闭环。

## What Changes

- 新增按凭据的事件回推：回推设置（接收地址、密钥、启用开关、速率限制、测试通知、最近投递记录）挂在每个程序接入凭据下；密钥仅存本机私有文件，界面默认隐藏、日志不输出明文，沿用 Bearer 携带。
- 推送范围按"凭据接手标记"隔离：对话第一次被某凭据通过 API 新建/发送/续发/补充时打持久标记，只推带该凭据标记的对话。
- 仅推五类事件 `decision.requested`、`run.completed`、`run.failed`、`run.stopped`（停止非该凭据发起）、`run.stalled`（fault 或 unknown 连续 5 分钟）；工具调用、流式、思考、中间消息、starting/running 切换、标题生成一律不推。
- 速率限制默认 180/小时、20/分钟，可按凭据修改；未超限立即推，超限后同对话同类事件合并并在额度恢复后发出，`decision.requested` 优先且不合并。
- 投递失败按 10/30/90/270/810 秒退避重试最多 5 次，仍失败标记未送达；事件持久化 7 天、重启序号连续；新增 `GET .../events` 按序号升序补查含未送达事件，丢弃时补发 `events_dropped`。
- 列表查询新增 `active`、`attention`、`fields=summary` 参数，固定返回 `activityCounts`，`limit` 生效。
- 新增单步续聊 `POST .../conversations/{conversationId}/messages`，内部完成 prepare-send+send，沿用原连接与模型，返回 202+runId，幂等与冲突规则同 send。
- 撤掉全局「事件通知」页签与其管理面，既有地址与密钥迁移到 GrokBot 凭据（`fb4ffb88-9fc6-48b1-b4d7-4fe98bb7c4a3`）回推设置下并保持停用；全局七类 Webhook 引擎由按凭据回推取代。
- `/help`、`/operations`、各操作 `documentationUrl`、OpenAPI 同步更新，`contractVersion` 变化，给出最小闭环示例。

破坏性变更：移除全局「事件通知」页签与全局 Webhook 管理接口（`/api/v1/app/agent-service/webhook-settings*`、`webhook-replay`）及 CLI 重放；既有全局配置迁移为凭据回推配置（停用）。程序接入既有 read/execute/answer/approve 操作语义不变。

## Capabilities

### New Capabilities

- `programmatic-event-pushback`：按程序凭据的事件回推，含接手标记、五类事件、速率限制与合并、有界退避投递、持久化补查、测试隔离与配置迁移。

### Modified Capabilities

- `programmatic-agent-access`：新增列表查询优化、单步续聊、事件补查与凭据回推配置管理操作，发现入口能力清单随之扩展。
- `outbound-conversation-webhooks`：退役全局单向通知能力，迁移到按凭据回推。

## Impact

涉及 `services/buildr-agent`（回推 Application/日志/配置、对话接手标记、列表与单步续聊、门面与进程接线）、`services/buildr`（程序接入 HTTP 管理面、events 接口、凭据迁移、文档/OpenAPI）、`services/buildr-web`（凭据回推设置 UI、移除全局事件通知页签）。不改变网页会话认证边界，不新增执行权限提升，不做发布。测试一律使用本地假接收端，不向真实地址推送。