## Context

此前 `buildr-harness-web` 中的对话草稿呈现逻辑（`conversation-draft-presence.ts` 与 `ConversationHistory.tsx`）仅在 `isExecuting`（`starting`/`running`/`stopping`）和发送清除期屏蔽了“有草稿”，导致两处问题：
1. 在“待查看”“待决策”“等待发送”“发送失败”“状态待确认”状态下，行内会同时渲染活动徽标与“有草稿”徽标，造成双状态并存与视觉干扰；
2. 非执行类的活动对话（如“待查看”“待决策”）在编辑/清空草稿时仍会被纳入 `settledDraftIds`，从而在没有任何排序或展示收益的情况下向列表接口发出冗余查询。

此外，结合此前交付的“待查看”并排滞留规则（`conversation-seen-hold.ts`）：当用户点击带未发草稿的“待查看”对话时，左侧“待查看”即时消除且排序暂持不变；若停留期间立刻补入 `settledDraftIds`，会在“待查看”消失的同一刻突然冒出“有草稿”，产生新的视觉跳变。将全活动状态屏蔽统一下沉到 `settleConversationDraftIds` 与 `shouldShowConversationDraft` 后，可以一并实现平滑的离开后再显现。

## Goals / Non-Goals

- **Goals**:
  - 保证对话列表每一行在任何时刻最多展示一个状态徽标（所有非空 `activityState(row)` 均严格隐藏“有草稿”）。
  - 存在任意活动状态期间，禁止该对话进出 `settledDraftIds`，消除冗余列表请求。
  - 在任意活动状态出现时立即撤下“有草稿”，消除 150ms 渐隐窗口期可能出现的双徽标同框。
  - 保持并排“待查看”转已读时的平滑过渡：停留查看时安静不弹出“有草稿”，离开后若仍留有草稿则自然显现。
- **Non-Goals**:
  - 不修改后端 `ConversationRepository.querySummaries` SQL 排序、分页协议或活动统计接口（后端已保证 `waiting`/`unseen`/`send-failed` 与 `list_active=1` 的排序权重严格高于 `buildr_has_draft`）。
  - 不更改本地 `sessionStorage` 草稿与附件存储格式及跨窗口同步机制。

## Decisions

1. **统一以 `activityState(row) !== null` 作为 `shouldShowConversationDraft` 唯一活动互斥守卫**：
   - `activityState`（定义于 `conversation-activity.ts`）是前端展示 `ConversationActivityStatus` 的唯一真源，涵盖 `'running' | 'waiting' | 'unseen' | 'send-waiting' | 'send-failed' | 'unknown' | null`。
   - `shouldShowConversationDraft` 直接判定 `if (activityState(row as ConversationSummary) !== null) return false;`，从源头上确保只要 `ConversationActivityStatus` 可能渲染非空徽标，“有草稿”就绝对不渲染。
2. **以 `activeStatusIds` 替代仅限 `executingIds` 的结算过滤**：
   - 在 `ConversationHistory.tsx` 中基于 `context.activityRows` 和 `context.conversation` 计算 `activeStatusIds`，关键点在于**逐行先调用 `applyConfirmedSeenActivity(row, context.seenActivities, context.conversation)` 再检查 `activityState(effective) !== null`**。
   - 这样做的原因：当用户在并排模式点击“待查看”对话 `C` 并收到 `markSeen` 确认后，`context.activityRows` 尚未退掉 `C` 的 `unseen` 前，`applyConfirmedSeenActivity` 已经把 `C` 的有效状态转为 `null`。`C` 离开 `activeStatusIds`，同时因为进入 `C` 前处于 `unseen`（故 `previousIds` 中不含 `C`）且当前 `C === activeEditingId`，`settleConversationDraftIds` 自动按规则保持 `C` 在停留期间不加入 `settledDraftIds`；待用户离开 `C`（`activeEditingId !== C`）且实时草稿非空时，再自然结算显示“有草稿”。
   - 同时保留 `executingIds?: ReadonlySet<string>` 可选字段兼容 `settleConversationDraftIds` 签名，避免意外破坏调用方约定。
3. **以 `immediateHide={activityState(row) !== null}` 控制 `DraftStatusBadge`**：
   - 此前只有 `isExecuting(row) || Boolean(sendActivity(row))` 触发 `immediateHide`，若空闲草稿对话在后台突然转入 `waiting`（待决策）或 `unseen`（待查看），旧逻辑会让“有草稿”保留 150ms `is-leaving` 与新活动徽标并排闪现；更新为 `activityState(row) !== null` 后任何活动状态到达都立即无延迟撤下“有草稿”。

## Knowledge Assessment

- **已核对架构文档**：`projects/product/knowledge/docs/architecture/agent-integration.md`（状态：`aligned`）。本次改动完全封装在 `buildr-harness-web` 对话历史呈现层与前端衍生草稿结算逻辑内，未改变客户端与执行服务端的边界、事件流或接口契约，因此架构知识保持一致，无需同步修改架构文档。

## Risks / Trade-offs

- **风险**：当工作区历史存在较远页的活动对话时，`context.activityRows` 全量覆盖前 100 条活跃对话（若 `activityCursor` 为空则为全量）；极端情况下未拉取到的第 101+ 条活跃对话仍受 `renderRow` 中 `shouldShowConversationDraft`（直接检测当前行 `activityState(row) !== null`）兜底保护，绝不会出现双徽标渲染。
- **权衡**：无需为草稿前端排除引入新的后端参数或缓存失效钩子，全部复用现有 `seenActivities`、`activityRows` 与 `settleConversationDraftIds` 机制，复杂度最低且可独立通过单测与浏览器端到端回归证明。
