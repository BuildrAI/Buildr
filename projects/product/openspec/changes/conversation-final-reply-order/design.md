## Context

对话列表的持久排序键目前是 `sort_priority DESC, user_at DESC, id DESC`：

- `sort_priority` 2 表示待决策、待查看或发送失败；1 表示其他活动执行；0 表示普通历史。
- `user_at` 只由用户新输入或有效答复更新；`activity_at` 是最新可见消息时间，包含助手输出，因此不能直接用作排序键。
- `summary.activity` 已经随对话摘要保存，并在列表查询中可直接读取；无需为列表再读取完整历史。

本变更只调整 `sort_priority=0` 的普通历史排序，活动、等待、未查看和待决策仍按用户输入排序。

## Goals / Non-Goals

**Goals:**

- 非活动对话按最近用户输入和最新 `completed` 轮最终可见主助手消息时间中较晚者排序。
- 最终答复只取最新 `completed` 轮的最后一条可见主助手消息，排除中间输出、工具、通知、失败消息和其他轮次。
- 最新轮不是 `completed`、没有最终助手消息或最终答复早于用户输入时，退回用户输入时间。
- 分页、刷新和游标使用同一排序键；排序变化能使旧游标失效。
- 不新增数据库列或一次性回填；历史摘要使用兼容回退。

**Non-Goals:**

- 不改变活动、等待、未查看和待决策的优先级与组内用户输入顺序。
- 不改变搜索、空间组排序、组内展开或前端布局。
- 不把工具结果、通知或 `failed` / `stopped` / `unknown` 的助手文本当作最终答复。
- 不改变任务范围列表（`listConversations`）的 `updated_at` 排序。

## Decisions

### 1. 最终答复时间作为 `activity` 的持久投影

在领域层增加 `finalReplyActivityAt(record)`：

- 仅当当前 `run` 存在、`status === 'completed'` 且未被 `supersededBy` 取代时计算。
- 只考虑 `kind === 'message'`、`role === 'assistant'`、非 `thinking`、非 `parentToolId`、`status !== 'failed'` 的条目。
- 有 `runId` 时只接受 `runId === run.id`；没有 `runId` 的旧条目要求 `createdAt >= run.startedAt`。
- 取满足条件的最新 `createdAt`；没有则返回 `undefined`。

`summaryView` 把结果写入 `activity.finalReplyAt`。该字段随摘要保存，列表查询可直接从 `summary` 读取；不需要新增 `conversations` 列，也不需要迁移回填。

**理由：** 摘要已经参与列表读取，新增可选字段的改动面远小于新增数据库列、版本升级和全量回填。最终答复时间只在保存对话时计算一次，列表读取不解析完整历史。

### 2. 历史摘要的兼容回退

旧摘要没有 `activity.finalReplyAt`。当当前轮为 `completed` 时，列表使用 `activity_at`（最近可见消息时间）作为回退；它通常就是该轮的最终助手消息时间。后续保存会写入精确的 `finalReplyAt`。

**理由：** 不要求用户手动修复或等待数据回填，已有的截图对话可以立即按新规则参与排序；极端情况下旧保留轮可能留下更晚的中间消息，这只影响历史兼容，不影响新写入。

### 3. 排序键与分页

列表在 `source` 子查询中派生 `order_at`：

```sql
CASE
  WHEN sort_priority > 0 THEN user_at
  WHEN json_extract(summary, '$.run.status') = 'completed'
   AND coalesce(json_extract(summary, '$.activity.finalReplyAt'), activity_at) > user_at
  THEN coalesce(json_extract(summary, '$.activity.finalReplyAt'), activity_at)
  ELSE user_at
END
```

排序改为 `sort_priority DESC, order_at DESC, id DESC`。分页游标携带 `order_at`，成员/顺序摘要使用 `[id, sort_priority, order_at]`，因此最终答复变化会使旧游标按现有“顺序已变化”语义失效。

**理由：** `sort_priority` 已经区分活动与普通历史；只对 `priority=0` 使用最终答复，可以保证活动、等待和未查看不被助手输出扰动。

### 4. API 与 schema

`ConversationView.activity` 增加可选 `finalReplyAt`；`operation-schemas.ts` 的 `activity` 增加可选 `finalReplyAt: text`。旧客户端忽略该字段，现有字段语义不变。

## Alternatives Considered

- **新增 `conversations.final_reply_at` 列并回填**：语义最直接，但需要模式版本升级、迁移备份、历史条目解析和回填；本变更的摘要投影已能提供相同排序，成本更低。
- **直接使用 `activity_at` 排序**：无需字段，但 `activity_at` 是整段对话的最新可见消息，包含中间助手输出，且可能被更早保留轮次影响；只作为历史兼容回退。
- **使用 `run.updatedAt`**：它是执行结束/观察时间，不是最终答复时间；工具清理可能晚于最终回复，无法满足“最终答复”语义。
- **把最终答复放进独立表**：列表需要额外连接，且没有比摘要更明确的权威需求。

## Risks / Trade-offs

- [历史摘要回退近似] 旧摘要没有精确最终答复时间，可能把旧保留轮的较晚中间消息当作最终时间；接受为历史兼容，新保存使用精确值。
- [completed 轮最后一条助手消息可能是过程说明] 以“最后一条可见主助手消息”作为最终答复的可测试代理；如果一轮以工具结果结束而没有助手文本，则退回用户输入。
- [游标失效] 排序键变化会让旧游标失效，客户端按现有逻辑重新读取；这是排序语义变化的预期结果。
- [公开字段增加] `activity.finalReplyAt` 为可选新增字段，旧客户端无需改动。

## Migration Plan

无数据库模式迁移。旧摘要按 `activity_at` 兼容回退；新保存写入 `finalReplyAt`。若需要回滚，删除该字段的读取与写入即可恢复原排序，已保存的摘要字段可被旧代码忽略。

## Open Questions

无。
