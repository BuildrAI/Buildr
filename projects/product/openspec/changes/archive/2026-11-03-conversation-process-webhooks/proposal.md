## Why
Grok Bot 需要持续看到用户目标、助手回复、卡片与执行过程，现有四类摘要不能表达完整变化。分散秘密文件也不能作为统一配置入口。

## What Changes
- 增加 conversation_updated 事件，覆盖每次统一对话视图变化，携带安全运行状态、完整待回应卡片与新增/更新消息。
- 保留四类旧事件与 Bearer 鉴权；新增正文属于明确授权的外发范围，不外发内部思考、原始工具输入输出或认证材料。
- 新增单一私有 JSON 配置文件，默认 ~/.buildr-webhook.json；兼容旧环境变量，配置文件优先且无效时不回退。
- 并发保持 16，新增最多 512 条等待队列；仍是无重试的有界尽力投递，不承诺可靠消息服务。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `outbound-conversation-webhooks`: 逐次过程事件、内容与配置入口。

## Impact
Agent Service 事件出口与服务组合、单元及真实 HTTP/文件测试、智能体操作指引。无任务数据或数据库迁移，不增加依赖。用户后续已授权本次必要提交、集成、普通推送与正式自举激活；不从候选直接激活共享环境。
