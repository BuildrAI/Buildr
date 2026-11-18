## 1. 后端活动统计与分组筛选对齐

- [x] 1.1 在 `services/buildr-harness` 合约、`operation-schemas.ts` 与 `ConversationApplication.needsAttention` 中补充可选 `activityCounts.sendFailed` 与发送失败判定，运行 `agent:prepare` 重新生成 DTO 产物并验证 schema 编译无误。
- [x] 1.2 更新 `ConversationRepository`（含 programmatic `attention` 与 `querySummaries`）统计 `sendFailed`、将 `send-failed` 纳入 `attention` 计数、扩展 `activityState=attention` 覆盖 `send-waiting`/`send-failed`，并通过 `conversation-activity.test.ts` 集成测试验证。

## 2. 前端状态计算、角标与双向实时收敛

- [x] 2.1 更新 `conversation-activity.ts`，将 `sendFailed` 计入 `activityBadge` 橙色待处理数与 `activityReminder`，增强 `pendingDecisions` 对实时 `requests` 的兜底，并导出 `shortConversationId` 与 `copyConversationIdTitle`。
- [x] 2.2 更新 `conversation-seen-hold.ts`，拆分 `mergeLiveActivity` 与 `applySeenSnapshot`，扩展 `applyConfirmedSeenActivity` 支持叠加 `activityRows` 并在同版本下禁止旧已读快照覆盖新增 `pendingDecisionCount` 与 `active`，更新 `workspaceOtherActivitySignature` 包含 `pendingSend`。
- [x] 2.3 更新 `AgentConversationsContext.tsx`、`conversation-history-page.ts`、`ConversationHistory.tsx`、`ConversationHistoryGroup.tsx` 与 `ConversationActivity.tsx`，补齐签名追踪并让列表与提醒浮窗共用同一实时叠加与过滤管线。
- [x] 2.4 更新 `conversation-children.ts` 与 `ConversationChildWindows.tsx`，复用 `activityState` 与 `applyConfirmedSeenActivity` 统一子对话状态判断与中文状态文案。

## 3. 精简对话 ID 为复制按钮并更新关联展示

- [x] 3.1 更新 `ConversationPanel.tsx`、`ConversationHistory.tsx`、`ConversationActivityEntry.tsx` 及 `agent-conversations.css`、`conversation-activity.css`，移除顶栏、列表行与浮窗行常驻 ID 文本，仅保留带 8 位短 ID 悬停提示的 `CopyButton`，并确保无元信息单行及标题栏布局不重叠、不折行。
- [x] 3.2 同步更新 `buildr-harness-web` 与 `buildr-web` 的 `ConversationAssociationPopover.tsx`，将对话条目展示的后缀 ID 缩为 8 位短 ID（悬停提示保留完整 ID），并保持双端文件逐字节一致。

## 4. 测试与验证

- [x] 4.1 补充并更新 `buildr-harness` 集成测试、`buildr-harness-web` UI 与浏览器测试及 `buildr-web` 浏览器场景测试，覆盖列表/浮窗状态同步、发送失败角标与子对话状态、以及 ID 复制按钮交互。
- [x] 4.2 重新运行 `agent:prepare` 及相关静态检查、单元测试、集成测试与浏览器场景验证通过（并评估受影响的 `knowledge/` 文档供后续校准）。
