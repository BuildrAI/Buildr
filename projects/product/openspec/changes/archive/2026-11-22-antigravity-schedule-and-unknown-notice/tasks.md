## 1. 规范与任务关联

- [x] 1.1 在独立工作树创建 OpenSpec 变更 `antigravity-schedule-and-unknown-notice`
- [x] 1.2 将变更关联到正式任务 `antigravity-schedule-and-unknown-notice` 并登记 `checks` 适用性结论

## 2. 后端修复（`buildr-harness`）

- [x] 2.1 在 `executors/antigravity/content.ts` 新增 `readAntigravityScheduleTriggers` 读取 `Timer`/`Cron` 触发记录
- [x] 2.2 在 `executors/antigravity/index.ts` 将 `Run schedule`/`schedule`/`Run run_workflow`/`run_workflow` 纳入后台工具识别并支持定时触发自动续行，并在 `resumeContext` 中保护 `backgroundWork`
- [x] 2.3 在 `application/conversation-application.ts` 的 `reconcile` 针对同代且未释放控制资源的活跃/未知轮透传 `savedRun?.permissionMode`
- [x] 2.4 在 `application/conversation-supplements.ts` 的未知拒绝分支透出 `observed.diagnostic` 可读原因与“先点击停止后再发送”指引

## 3. 前端修复（`buildr-harness-web`）

- [x] 3.1 在 `conversation-notices.ts` 新增 `conversationLiveUnknownReason` 提取真实可读诊断与错误码映射
- [x] 3.2 在 `ConversationExecutionNotice.tsx` 对未释放 `unknown` 轮直接展示真实诊断（仅无可读原因时回落“暂时无法读取执行状态”）
- [x] 3.3 在 `conversation-state.ts` 的 `conversationObservationFeedback` 中展示未释放 `unknown` 轮的真实原因并引导先点击“停止”后再继续

## 4. 测试与验证

- [x] 4.1 补齐单元测试 `antigravity-command-exits.test.ts`（`readAntigravityScheduleTriggers`）
- [x] 4.2 补齐夹具场景与集成测试 `antigravity.test.ts` / `conversations.test.ts`（定时等待 ACP 与转录续行、等待期追加、非后台工具不误判、`full-access` 核对不误杀、未知轮追加拒绝带真实原因）
- [x] 4.3 补齐 UI 测试 `conversation-execution-notice-render.test.mjs` 与 `agent-conversations.test.mjs`
- [x] 4.4 执行 `openspec validate`、`test:static`、`test` 与受影响 `test:integration` 检查并全部通过
