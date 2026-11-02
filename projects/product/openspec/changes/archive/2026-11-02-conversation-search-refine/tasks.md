## 1. 契约与响应结构

- [x] 1.1 在 `buildr-agent` 的 `ConversationView` 与 `operation-schemas.ts` 的 `conversation` schema 中增加可选 `searchSnippet` 字段，并重新生成 `buildr-web` DTO；用 schema 校验与前端类型检查确认可选字段不会破坏现有响应。
- [x] 1.2 核对 `AgentConversationsPage` 的 `additionalProperties:false` 约束，确认带片段的列表响应能通过 HTTP 校验；用 agent-service HTTP 契约测试验证。

## 2. 服务端搜索与片段

- [x] 2.1 在 `conversation-repository` 提取统一搜索谓词：标题或 `kind=message`、`role in (user,assistant)`、非 thinking 的 entry 文本；空白拆分最多 6 个词项并逐项 AND。`querySummaries` 与 `listConversations` 共用该谓词；用集成测试验证标题命中、消息命中、工具日志不命中。
- [x] 2.2 在 `querySummaries` 为分页候选行计算有界 `searchSnippet`（约 120 字符，围绕最早命中词项）；标题已命中时允许为空，片段不写入历史；用集成测试验证片段内容、长度与不改变 revision。
- [x] 2.3 保持 `agent`/`model` 执行筛选与游标分页参数不变；用现有筛选测试确认筛选结果、总数与片段可共存。

## 3. 前端搜索与统计

- [x] 3.1 在 `ConversationHistory` 增加 250ms 防抖查询值，分组、分页和空态使用防抖值；顶部执行统计读取只依赖工作空间范围，不随关键词、隐藏或执行筛选重发；用单元/浏览器测试验证关键词变化时统计请求不增加、旧结果不覆盖。
- [x] 3.2 通过分组回报的过滤总数计算空态，未加载或折叠分组不显示假空态；用浏览器测试覆盖“有匹配”“全部无匹配”“单组折叠”场景。
- [x] 3.3 在对话行展示 `searchSnippet` 单行省略文本，无片段时保持原布局；补充样式并验证窄宽度不挤出操作区。
- [x] 3.4 让 `ConversationExecutionSummary` 在有 `onFilter` 时把模型统计项渲染为可切换按钮，接入 `filter.kind='model'`，再次点击或“清除筛选”恢复；活动浮窗保持只读摘要；用浏览器测试验证筛选请求参数、结果与恢复。

## 4. 请求取消与共享读取

- [x] 4.1 重构 `shared-conversation-read`：每个 URL flight 持有独立取消控制器和 15 秒超时，最后一个消费者离开时删除 flight 并中止底层 fetch，仍有消费者时保持读取；用单元测试验证单消费者取消、多消费者共享和迟到结果隔离。

## 5. 测试与知识

- [x] 5.1 更新 `buildr-web` 浏览器夹具与搜索场景，按标题+用户/助手消息过滤并展示片段；运行相关浏览器检查。
- [x] 5.2 更新 `buildr-agent` 集成测试，覆盖多关键词 AND、工具/通知/thinking 不命中、片段边界、模型筛选。
- [x] 5.3 更新 `projects/product/knowledge/code-map/technical-layers.md` 与 `knowledge/docs/architecture/agent-integration.md` 中对话搜索、执行统计筛选和共享读取的职责描述；同步维护 `projects/product/.buildr/knowledge-impact.yml` 的本次任务影响。
- [x] 5.4 运行 `openspec validate conversation-search-refine --strict` 与 `buildr openspec convergence preflight`，并执行受影响服务的静态检查与单元测试；记录实际命令与结果。
