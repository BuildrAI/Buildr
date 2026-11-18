## 1. 服务端持久化、恢复与契约同步

- [x] 1.1 更新 `ConversationEntry` 契约与 `operation-schemas.ts`（添加可选 `continuedFrom?: { runId: string; userEntryId: string }`），并同步更新 `ConversationReadModel`（`continuationVersion: 2` 与 `continuationLinks`）和 `ConversationRepository` 修复查询；运行生成物准备脚本刷新 `agent-service-http-dto.ts` 并确认静态检查通过。
- [x] 1.2 在 `conversation-application.ts` 中实现接续通知 `continuedFrom` 写入与视图投影；完善 `releaseIdleSources`、`releaseRetiredWork` 与 `recoverRun` 对服务退休中断打标及旧代次退出释放后的自动恢复放行；在 `server.ts` 中检测 peer 代次退出并触发 `recoverAfterHostAttach()`。
- [x] 1.3 更新并补充 `conversation-read-model.test.ts` 与 `resource-lifecycle.test.ts` / `conversations.test.ts` 测试，验证退休重启自动接续与 `continuationLinks` 投影均通过。

## 2. 前端对话流回合复用与浏览器场景

- [x] 2.1 更新 `conversation-state.ts`（`conversationStreamTurns`、`finalConversationReplyIds`、`conversationTurnTiming`、`conversationTurnExpansionKey`）及 `ConversationPanel.tsx`，使同页内连续接续复用既有交互回合、合并中途叙述并保持吸顶、计时与折叠稳定。
- [x] 2.2 更新 `development-process-regression.test.mjs` 与 `agent-conversations-history-scenarios.ts`（`history/continuation-prompt`），运行 UI 单元测试和浏览器 E2E 测试验证同页复用与跨分页快照展示。

## 3. 知识与验证同步

- [x] 3.1 核对 `knowledge/docs/architecture/agent-integration.md` 第 291 行的受影响说明范围，在完成全部核心代码与四类适用验证后汇报结果并确认知识同步边界。
