## Context
现有 Agent service 提供对话 HTTP 契约；Web 使用注入的会话令牌与 Origin 保护写入。

## Goals / Non-Goals
仅新增 CLI 薄客户端；不配置账号、不维护 Task、不新增 HTTP route、不直接连接执行进程。

## Decisions
- 使用当前 profile 的 instance.json 发现本机实例，校验回环 URL、健康 PID，再读取既有首页会话。相比新增认证端点，此方案不扩大接口边界。
- `--target` 默认当前目录，从既有 workspace.yml 只读解析身份，也允许 `--workspace-id` 明确选择已登记空间。
- `--connection` 显式选择连接；省略时仅在唯一 ready 且 enabled 连接存在时使用。不按厂商猜测。
- 除 list 默认中文列表外，JSON 输出完整服务结果；读取支持 `--before` 与 `--limit`，不隐式拉取全部历史。
- 请求有有限超时且禁止重定向。发送创建后失败保留 conversationId，不自动删除或重发。

## Risks / Trade-offs
- 首页 HTML 令牌格式变更会影响客户端 → 明确诊断并测试提取逻辑，不放宽认证。
- 网络失败可能已产生副作用 → 不重试；保留 conversationId 供 read 核对。
- read 的 observe 会执行原服务的状态核对 → 不扩展到 seen、reply 或 Task 写入。

## Migration Plan
无数据迁移；删除新增 CLI 注册即可回退。


## 新增命令的边界
- list 只使用 conversations HTTP 列表接口，包含隐藏对话并遍历分页；支持 query 和每页 limit。保留服务端排除空白对话的既有语义，不直接查询数据存储。
- reply 先 observe，从目标 pending request 获取 runId、participantId、generation，携带当前 expectedRevision，原样发送用户给出的 answer 文本；不默认选择、不解释审批、不重试已处理请求。
- continue 先 observe，拒绝活动及未知执行、未完成 retainedRuns、待处理问题和 pendingSend；沿用原参与者连接和模型配置，prepare-send 后 send，不新建对话、不补充或排队。
- 所有用户帮助、列表表头和本地诊断使用中文；JSON 协议字段及服务返回值保持原样。
