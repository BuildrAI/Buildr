## Why

对话列表面板顶部的分类统计栏（待查看/待处理/执行中计数）与“执行状态暂时无法确认”提示条、提醒浮窗中的“执行状态需确认”提示条，与列表逐条对话的状态徽标（状态待确认/待决策/待查看/执行中）信息重复；正常时只增加视觉噪音。用户明确判断这些聚合统计与提示条没有必要，要求移除。

## What Changes

- 对话列表面板移除常驻分类统计栏（待查看/待处理/执行中计数 chips）及其“执行状态暂时无法确认（未更新）”提示条与“查看对话/返回全部”入口。
- 提醒浮窗移除“N 个对话的执行状态需确认”提示条。
- 未知执行不再以聚合提示条表达：条目在提醒浮窗与完整列表的共同活动清单中保留“状态待确认”身份徽标，入口悬停说明与可访问名称保留未知计数。
- 完整列表保留执行分布筛选（“执行中模型”摘要及其筛选清除）、空间范围、搜索、分页与分组行为；服务端 `activityState` 分类查询能力保留（提醒分页继续使用 attention/running 两组）。
- 同步更新单元测试与浏览器验收断言，校准代码地图中对该组件的描述。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`：修订“活动提醒必须区分需要用户关注的对话”与“活动分类必须覆盖完整范围并支持准确定位”两条要求——未知执行改为条目徽标与入口说明表达，完整列表不再保留常驻分类统计筛选与聚合提示条。

## Impact

- `services/buildr-web/src/features/agent-conversations/`：删除 `ConversationActivityFilters.tsx` 及其在 `ConversationHistory.tsx` 的装配与相关状态；`ConversationActivityEntry.tsx` 移除未知提示 Alert；`conversation-activity.ts` 移除 `activityFilterLabels`；`conversation-activity.css` 移除分类栏样式。
- 测试：`services/buildr-web/test/conversation-activity-reminders.test.mjs`、`services/buildr-web/test/browser/agent-conversations-journey.ts`。
- 知识：`knowledge/code-map/technical-layers.md` 中 `ConversationActivityFilters.tsx` 条目需删除或改写。
- 服务端 `buildr-agent` 的 `activityState` 查询参数保持不变，无接口破坏。
