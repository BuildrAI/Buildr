## Why

对话列表搜索当前匹配标题和所有 entry 文本，工具命令、工具输出、通知与思考内容都会命中；真实库约 84MB 内容来自工具日志，常见关键词因此几乎命中全部对话，且列表不展示命中原因，看起来像过滤未生效。每次输入还会触发统计请求和每个工作空间组请求，服务端对 `conversations.body` 做无索引全量 JSON 扫描。另有一个规范已要求但当前未接线的能力：完整列表的模型统计项无法点击筛选。

## What Changes

- 搜索范围限定为对话标题和用户/助手可见消息；工具、通知、handoff 和 thinking 内容不再作为命中依据。
- 空白分隔的多个关键词按 AND 匹配；每个关键词都须命中标题或任一可见消息。
- 列表结果返回有界的命中消息片段，并在对话行中展示；片段只用于本次读取，不写入历史。
- 搜索输入使用 250ms 防抖；共享读取在最后一个消费者离开后真正中止请求；执行统计读取不再随关键词重发。
- 完整列表的模型统计项恢复点击筛选，再次点击或清除恢复原列表。
- 不引入 FTS5、数据库迁移或历史格式变化；大库索引优化留待后续独立变更。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 新增对话搜索的内容范围、多关键词 AND、命中片段与搜索变化时的结果一致性要求。
- `buildr-web-client`: 对话历史搜索从“搜索标题”扩展为标题与用户/助手可见消息，并要求展示命中片段。

## Impact

- `services/buildr-agent`：`conversation-repository` 搜索谓词与片段读取、`contracts` 可观察视图、`operation-schemas` 的 `AgentConversation` 响应、集成测试。
- `services/buildr-web`：`ConversationHistory`、`ConversationHistoryGroup`、`useConversationHistoryPage`、`shared-conversation-read`、`ConversationExecutionSummary`、对话类型、样式与单元/浏览器测试。
- `services/buildr`：HTTP 响应校验继续从 `@buildr-ai/buildr-agent` schema 派生，无独立业务逻辑；需要重新生成前端 DTO。
- `projects/product/openspec/specs/agent-conversations/spec.md` 与 `projects/product/openspec/specs/buildr-web-client/spec.md`。
- 当前知识：对话列表搜索与执行统计的代码地图/架构说明。
