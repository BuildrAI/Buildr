## 1. 草稿派生与编辑态结算逻辑

- [x] 1.1 在 `conversation-draft-presence.ts` 与 `useConversationDraftPresence.ts` 实现按工作空间解析的草稿感知、执行中排除（`shouldShowConversationDraft`）、并排编辑期席位锁定与离开结算（`settleConversationDraftIds` / `workspaceConversationDraftIds`），并通过 `conversation-draft-presence.test.mjs` 单元测试验证。

## 2. 列表局部静默刷新与视觉过渡

- [x] 2.1 在 `useConversationHistoryPage.ts` 将草稿作用域由内部订阅改为可选显式参数，同筛选条件切换草稿作用域时保留已展示行就地更新；在 `ConversationHistoryGroup.tsx` 与 `ConversationHistory.tsx` 实现顶部统计与无关工作空间隔离、执行中与并排编辑隐藏“有草稿”及 `DraftStatusBadge` 淡入淡出。
- [x] 2.2 在 `agent-conversations.css` 添加 `.ac-draft-status` 淡入淡出过渡与 `prefers-reduced-motion: reduce` 适配，并通过 `buildr-harness-web` 类型检查与既有列表单元测试。

## 3. 浏览器交互验证与文档评估

- [x] 3.1 新增并通过 `services/buildr-harness-web/test/browser/draft-list-calm.test.ts` 浏览器端到端场景（覆盖执行中忽略草稿、分屏编辑保持安静且统计/无关空间/列表不闪烁、离开后平滑呈现与重排），并核实通过。
- [x] 3.2 核对 `knowledge/` 受影响说明（确认现有认知仍准确、无需改动）。
