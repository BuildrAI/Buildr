## Context
ConversationEvents 是统一对话视图发布出口，不修改执行器及另一对话正在维护的权限文件。

## Goals / Non-Goals
通知四类状态；不新增入站控制、令牌管理、持久化队列或可靠消息服务。

## Decisions
- 服务组合读取 BUILDR_AGENT_WEBHOOK_URL 与 BUILDR_AGENT_WEBHOOK_SECRET；两者同时有效才启用。支持 HTTP/HTTPS（生产推荐 HTTPS），拒绝 URL 内认证信息和非 HTTP 协议。
- POST JSON，Authorization: Bearer <secret>，禁止重定向。负载包含 eventId、conversationId、workspaceId、eventType、summary、timestamp；摘要固定描述，不复制对话或错误内容。
- 用运行 ID 加终态或请求 ID 构造稳定事件 ID；同进程最多保留 10000 个去重 ID（超出后淘汰最旧者）。重启不扫描历史，不补发。接收方也应按 eventId 去重。
- 无自动重试，每事件最多尝试一次，避免超时但远端已接收的重复通知；这是尽力、非可靠投递。并发上限 16，容量满时丢弃通知，不阻塞执行。请求 5 秒超时，关闭时取消未完成请求。
- 发送、解析及鉴权配置失败静默隔离，不打印 URL、密钥或异常。未配置不影响原流程。

## Risks / Trade-offs
网络错误、服务退出、容量上限会丢通知；有限去重缓存淘汰后旧事件再次发布可能重复，接收方按稳定 ID 防重。配置者负责目标可信与网络策略；URL 不接受模型输入。

## Migration Plan
环境变量注入 Agent service 进程后重启；取消任一变量即可关闭，不迁移存储。智能体使用时不得把密钥写进对话或命令记录，应通过宿主秘密注入配置。

## Open Questions
无阻塞问题；用户未指定可靠性 SLA，选择不重试的尽力交付并明确边界。
