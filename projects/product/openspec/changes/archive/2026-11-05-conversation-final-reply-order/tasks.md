## 1. 最终答复投影

- [x] 1.1 在 `conversation-activity.ts` 增加 `finalReplyActivityAt(record)`，只接受最新 `completed`、未取代轮次的最后一条可见主助手消息，排除 `thinking`、工具、通知、失败消息和其他轮次。
- [x] 1.2 在 `summaryView` 的 `activity` 写入可选 `finalReplyAt`，并更新 `ConversationView` 与 `operation-schemas.ts` 的可选字段。
- [x] 1.3 为领域规则补充单元测试：completed、failed/stopped/unknown、无最终消息、其他轮次、`thinking`/工具/失败消息、旧条目无 `runId`。

## 2. 列表排序与分页

- [x] 2.1 在列表 `source` 中派生 `order_at`：活动优先级使用 `user_at`，非活动优先级使用 `max(user_at, activity.finalReplyAt ?? activity_at)`。
- [x] 2.2 列表排序、游标条件、成员/顺序摘要和 `nextCursor` 统一改用 `order_at`；更新 scope 版本使旧游标失效。
- [x] 2.3 保持活动、等待、未查看、待决策、搜索和空间组行为不变。

## 3. 回归测试

- [x] 3.1 集成测试覆盖：completed 最终答复使非活跃对话前移；中间助手输出、工具、failed/stopped/unknown 不改变；活动/待查看仍按用户输入。
- [x] 3.2 集成测试覆盖：最终答复变化使旧游标失效；历史摘要没有 `finalReplyAt` 时按 `activity_at` 兼容回退。
- [x] 3.3 运行 `conversation-activity` 相关单元/集成测试与 `npm run test`（agent-unit），确认无回归。

## 4. 当前知识与规范

- [x] 4.1 更新 `knowledge/code-map/technical-layers.md` 与 `system-services-assets.md` 中对话列表排序、活动摘要和最终答复说明。
- [x] 4.2 运行 `openspec validate conversation-final-reply-order --strict` 与 `buildr openspec convergence preflight`，确认差异规范可归档。
- [x] 4.3 运行四服务 `npm run check`，确认静态检查与单元测试通过。
