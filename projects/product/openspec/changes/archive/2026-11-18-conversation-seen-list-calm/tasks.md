## 1. 规划与状态设计

- [x] 1.1 创建并实现 `projects/product/services/buildr-harness-web/src/features/agent-conversations/conversation-seen-hold.ts` 纯函数模块（已读活动快照、查看席位锁位状态机、行位固定及执行统计签名），并通过单元测试验证逻辑边界

## 2. 上下文与界面接入

- [x] 2.1 更新 `AgentConversationsContext.tsx`，在 `sendSeen` 确认成功后记录服务端返回的完整 `seenActivities` 快照并向消费方暴露
- [x] 2.2 更新 `ConversationHistoryGroup.tsx` 与 `ConversationHistory.tsx`，在分屏并排查看期间接入已读状态叠加、席位锁定、离开后失效结算以及统计版本隔离

## 3. 验证与交付准备

- [x] 3.1 新增单元测试 `test/ui/conversation-seen-hold.test.mjs` 并扩展端到端浏览器测试 `test/browser/focus-split-seen.test.ts`，覆盖并排查看隐藏待查看、停留锁位零重刷、离开后重排归位、旧消息停驻不误清及跨空间/统计零干扰
- [x] 3.2 运行前端构建、目标测试、`verify-impact.mjs` 改动影响检查、`npm run check` 全量静态与单元测试以及 `openspec validate` 与 `openspec convergence preflight` 确认全部通过
