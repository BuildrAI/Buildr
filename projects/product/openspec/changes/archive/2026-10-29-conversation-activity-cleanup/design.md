## 背景与决定

分类统计栏同时承担“统计展示”和“状态筛选”两种职责。用户以“列表已逐条显示具体状态”为由要求移除整行；因此本变更同时放弃完整列表的状态筛选能力，只保留执行分布筛选（“执行中模型”摘要入口）。

决定：

- 聚合信息只保留两处低噪音出口：入口单角标（待处理优先、否则执行中）与入口悬停说明/可访问名称（含未知计数）。
- 未知执行的可发现性改由条目承担：提醒浮窗与完整列表的活动清单按“待处理 > 状态待确认 > 其余”排序，未知条目带“状态待确认”徽标位于前列，不需要聚合提示条引导。
- 提醒分页继续使用服务端 `activityState=attention|running` 两组游标，保证后页待处理仍可发现；该能力不因界面移除而收缩。

## 取舍与风险

- 长列表下“只看某类状态”的操作路径消失。缓解：活动条目优先排序、逐条徽标、搜索与空间筛选保留；提醒浮窗仍集中列出活动对话。
- 移除提示条后，读取失败（stale）仍由完整列表既有错误 Alert 与入口 `is-stale` 形态表达，不丢失失败反馈。

## 实现轮廓

- 删除 `ConversationActivityFilters.tsx`；`ConversationHistory.tsx` 移除 `activityFilter`/`counts` 状态与 `activityState` 查询参数传递，保留 `filter`（执行分布）与其余行为。
- `ConversationActivityEntry.tsx` 删除未知 Alert；`conversation-activity.ts` 删除 `activityFilterLabels`，保留 `activityReminder`、`activityBadge` 与状态判定。
- 清理 `.ac-activity-filters` 样式；更新单测与浏览器验收断言；校准代码地图。
