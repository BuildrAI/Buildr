## 1. 回推后端基础（buildr-agent）

- [x] 1.1 新增回推私有存储：每凭据配置（url/enabled/rateLimitHour/rateLimitMinute/revision/secretFilePath）、密钥 600 文件、接手标记、停止归属、事件日志（全局序号、7 天保留、投递状态）、限速与合并状态、实例稳定标识。
- [x] 1.2 新增五类事件域函数：从 ConversationView 与 prior snapshot 差分产 decision.requested/run.completed/run.failed/run.stopped/run.stalled，含 machine、summary≤500、detailUrl、request；脱敏密钥与地址。
- [x] 1.3 新增回推 Application：配置 read/save/reveal/test、markTakeover、记录停止发起、事件补查 listEvents、速率限制与合并、有界退避投递（10/30/90/270/810、最多 5 次、未送达标记）、unknown 连续 5 分钟周期检查、events_dropped。
- [x] 1.4 门面与进程接线：agent-service 返回 pushback 命名空间；operations.ts 方法白名单与输入 schema；client.ts 代理；operation-schemas.ts 与 contracts.ts 类型。ConversationEvents 扇出切换到回推。

## 2. 列表优化与单步续聊（buildr-agent + buildr）

- [x] 2.1 列表 Application 与仓储支持 active/attention/fields=summary 过滤投影，固定 activityCounts，limit 生效；门面与 HTTP 查询白名单扩展。
- [x] 2.2 单步续聊：buildr HTTP 新增 messages 操作，内部串联 prepareSend+send，沿用原连接与模型，202+runId，幂等与 409 同 send；操作白名单与 schema。

## 3. 程序接入管理面与迁移（buildr）

- [x] 3.1 凭据回推配置 HTTP 管理接口（read/save/reveal/test/最近投递），经宿主认证与门面 pushback；程序接入 start/send/supplement 成功后 markTakeover，stop 记录发起凭据。
- [x] 3.2 新增 GET .../events 补查接口（read，after/limit，默认 50 最大 200，升序含未送达）。
- [x] 3.3 启动迁移既有全局 Webhook 配置到 GrokBot 凭据回推（停用，幂等）；移除全局 webhook-settings/replay 管理路由与 CLI 重放。

## 4. 前端（buildr-web）

- [x] 4.1 凭据卡片下新增回推设置（地址/密钥隐藏与查看/启用/速率限制/测试/最近投递）。
- [x] 4.2 移除全局「事件通知」页签及其管理 UI；迁移提示。

## 5. 文档与 OpenAPI（buildr）

- [x] 5.1 更新 programmatic-help/operations/openapi：新增 messages、events、回推配置操作与列表参数；contractVersion 变化；最小闭环示例。

## 6. 测试与验证

- [x] 6.1 回推单元/集成测试（本地假接收端）：接手范围、五类事件、停止归属、限速合并、退避与未送达、序号连续、补查、迁移、测试隔离。
- [x] 6.2 列表参数与单步续聊测试；更新/替换受影响的旧全局 Webhook 测试。
- [x] 6.3 三服务静态检查与单元测试；本机开发版 4458 验证回推设置、列表参数、单步续聊。

## 7. 规范与交付

- [x] 7.1 同步主规格（programmatic-event-pushback 新增、programmatic-agent-access 修改、outbound-conversation-webhooks 退役）。
- [x] 7.2 完成仓库适用检查、集成到 dev 并推送，确保本机开发版运行新代码；task-finish 收尾。
