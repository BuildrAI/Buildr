## 1. 前端单状态展示与草稿结算实现

- [x] 1.1 在 `conversation-draft-presence.ts` 中将 `shouldShowConversationDraft` 的互斥判定由 `isExecuting` 扩展为 `activityState(row) !== null`，并在 `settleConversationDraftIds` 中支持 `activeStatusIds` 排除所有活动状态对话（保留 `executingIds` 兼容）。
- [x] 1.2 在 `ConversationHistory.tsx` 中结合 `applyConfirmedSeenActivity` 派生 `activeStatusIds`，传入 `settleConversationDraftIds` 与初始 `settledRef`，并将 `<DraftStatusBadge>` 的 `immediateHide` 更新为 `activityState(row) !== null`。

## 2. 自动化测试与校验

- [x] 2.1 更新 `test/ui/conversation-draft-presence.test.mjs`，覆盖全部 6 种非空 `activityState` 隐藏“有草稿”、`activeStatusIds` 屏蔽以及并排查看“待查看”后离开才结算“有草稿”的场景。
- [x] 2.2 更新 `test/browser/draft-list-calm.test.ts`，校验执行后台结束后进入“待查看”时不共存“有草稿”、点入消除未读后停留安静而离开才显“有草稿”，以及新增“待决策”状态隐藏“有草稿”并在消除后显现的真实浏览器端到端用例。
- [x] 2.3 完成 Web 构建、前端单测、类型检查、浏览器端到端验证、影响面检查与全仓预推送检查。
