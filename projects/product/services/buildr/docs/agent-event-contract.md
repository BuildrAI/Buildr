# 智能体事件契约

所有执行器共享同一套通知类型：`task_started`、`status_changed`、`reply`、`pending_question`、`pending_approval`、`completed`、`error`。每条事件均为 JSON 对象，包含以下必填字段；附加字段由接收端原样转发，不根据厂商、状态或内容作业务判断。

| 字段 | 含义 |
| --- | --- |
| eventId | 不变的事件标识，自动补推和显式重放保持一致 |
| conversationId | 原对话标识 |
| agent | 包含 name 与 id 的发送方对象；Buildr 的 name 为 Buildr，id 为本实例持久 UUID |
| machine | Buildr 所在机器的主机名，与 agent 并列 |
| eventType | 七种事件类型之一 |
| summary | 简短通知摘要 |
| timestamp | 事件发生时的 ISO 时间，重放不更新 |

Buildr 还发送 workspaceId、revision、对话内递增 sequence 及相关 runId、entryId 或 request。实例 ID 保存在本实例私有数据目录，重启不变，独立实例不同；不使用模型、执行器名称或进程代次作为发送方 ID。

问题卡片、待审批、完成和错误立即持久入队；问题通知携带准确 request/question/option ID，审批命令不外发。卡片关闭仅表示不再等待，不表示已回答或批准。`reply` 仅含回复位置和状态，不含每轮回复全文或流式片段。接收端通过 `buildr agent read <conversation-id>` 按需获取正文；用户回答使用 `reply` 的卡片提交接口，普通消息和 supplement 不构成卡片答案。

发送端负责语义去重、持久保存、退避重试和断线补推。请求使用 Bearer 鉴权，禁止重定向，5 秒超时、最多16个并发请求；只有 HTTP 2xx 确认成功。非2xx、断线和超时使用同一 eventId 重试，从1秒指数退避至最多5分钟，持续保留未确认事件。服务恢复后自动领取未投递事件，并从已提交对话补齐当前状态。配置变化不把旧目标事件自动发送给新地址或新凭据。成功事件保留供 `agent replay <conversation-id> <event-id>` 显式重放，额外字段不改变。

传输是至少一次：接收成功但确认响应丢失时，接收端可能重复收到相同 eventId。发送端不制造新的事件 ID，也不因补推重新执行模型、审批或业务动作。接收端只接收和转发，不承担发送方的重试与断线恢复。HTTP 2xx 只证明接收端确认，不证明其后续转发或业务处理成功；如需补推已确认事件，使用原 eventId 显式重放。

持久日志属于实例私有通知数据，不属于任务数据，不保存认证密钥。内部思考、原始工具输入输出和完整回复正文不进入事件日志。磁盘不可写时输出不含秘密的通知存储诊断，不回滚已提交的对话；恢复后从当前对话状态核对，不伪造未观察到的中间状态。
