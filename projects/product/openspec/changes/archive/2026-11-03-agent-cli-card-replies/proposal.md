## Why

CLI 缺少结构化卡片回答、同对话跳过卡片及执行中补充入口；Webhook 的固定身份、正文推送和进程内尽力队列无法支持可靠的外部通知。补齐共享事件契约与发送端投递责任，使接收端只接收和转发，不承担业务判断与重试。

## What Changes

- reply 支持重复 --option/--other 或互斥 --answer-json，校验当前卡片并走正式提交。
- send 支持 --conversation <id> --skip-questions，记录未回答并在同一对话开启新一轮。
- 增加 supplement 向运行中的原执行补充输入，增加 replay 按 eventId 重放通知。
- **BREAKING** send 移除 --connection 和 --model，已有对话沿用原配置；新建只选择唯一 enabled 且 ready 连接。
- **BREAKING** Webhook 只发送七类公共事件，移除 conversation_updated 与回复正文推送；所有事件增加 machine，agent.id 改为实例持久 UUID。
- 持久保存事件与投影，使用租约、退避重试、启动补推及显式原样重放。接收确认丢失可能导致同 eventId 重复到达，不宣称恰好一次。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-cli`: 结构化回答、同对话新轮次、执行中补充和 Webhook 事件重放。
- `outbound-conversation-webhooks`: 七类统一轻量事件、实例与主机身份、正文按需拉取及持久退避补推。

## Impact

影响 Buildr CLI、Agent Service 的等待交接与通知协议、本机 HTTP 与进程操作、隔离回归测试、公共事件契约、CLI 文档、随包技能指引及架构说明。新增实例私有 Webhook 日志，不修改任务数据，不推送、不激活共享环境、不重启共享服务。
