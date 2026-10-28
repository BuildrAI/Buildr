## 实施

- [x] 删除 `services/buildr-web/src/features/agent-conversations/ConversationActivityFilters.tsx`，并移除 `ConversationHistory.tsx` 中其装配、`activityFilter`/`counts` 状态、`activityState` 查询参数传递及相关 effect。
- [x] `ConversationActivityEntry.tsx` 移除“N 个对话的执行状态需确认”Alert；`conversation-activity.ts` 删除 `activityFilterLabels`，保留 `activityBadge`、`activityReminder` 与状态判定。
- [x] `conversation-activity.css` 删除 `.ac-activity-filters` 相关样式。
- [x] 更新 `services/buildr-web/test/conversation-activity-reminders.test.mjs`：删除分类栏与未知提示条断言，保留角标、悬停说明与执行中模型摘要断言。
- [x] 更新 `services/buildr-web/test/browser/agent-conversations-journey.ts`：未知执行改为断言条目“状态待确认”徽标与入口说明，浮窗无分类栏断言扩展到完整列表。

## 当前知识

- [x] `knowledge/code-map/technical-layers.md`：删除 `ConversationActivityFilters.tsx` 条目，将入口单角标与未知执行表达事实并入 `ConversationActivityEntry.tsx` 描述。
- [x] `knowledge/docs/architecture/agent-integration.md`：更新“完整对话列表继续保留原分类筛选及按智能体、模型的执行统计”一句为移除分类统计栏与未知提示条、保留执行分布筛选与搜索空间行为。

## 验证

- [x] `openspec validate conversation-activity-cleanup --strict` 与 `buildr openspec convergence preflight` 通过。
- [x] buildr-web 静态检查（类型检查/lint）与单元测试通过。
