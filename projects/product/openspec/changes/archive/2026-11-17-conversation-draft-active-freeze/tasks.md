## 1. 草稿状态冻结与提交清除规则

- [x] 1.1 在 `conversation-draft-presence.ts`、`useConversationDraftPresence.ts` 与 `useConversationDraft.ts` 统一 `shouldShowConversationDraft(row, settledDraftIds)` 并补充 `submittedClearedIds` 与 `pendingSendIds` 立即清除支持，更新 `test/ui/conversation-draft-presence.test.mjs` 覆盖点回已有草稿、停留清空、离开结算及直接发送清除场景。

## 2. 对话列表展示绑定与浏览器验证

- [x] 2.1 更新 `ConversationHistory.tsx` 将 `DraftStatusBadge` 与 `settledDraftIds` 绑定并在进入待发送/执行中时即时隐藏。
- [x] 2.2 更新 `test/browser/draft-list-calm.test.ts` 验证点回已有草稿不消失、停留清空保持原状与零请求、离开后再清除及直接发送后立即清除，并通过全部产品静态、单测与影响检查及预览验证。
