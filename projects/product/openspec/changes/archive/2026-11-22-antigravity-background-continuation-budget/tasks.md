## 1. 规格与状态常量准备

- [x] 1.1 在 `services/buildr-harness/src/domain/agent-state.ts` 中导出统一后台续行上限诊断常量 `BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC`
- [x] 1.2 完成 `projects/product/knowledge` 影响评估，确认现有长期知识文档无需修改

## 2. Antigravity 执行器续行预算与资源释放

- [x] 2.1 在 `services/buildr-harness/src/executors/antigravity/index.ts` 将默认 `MAX_BACKGROUND_CONTINUATIONS` 提升至 `20`，并支持构造选项注入 `maxBackgroundContinuations`
- [x] 2.2 在 `TurnState` 中拆分预算计数 `continuations` 与持久化序号 `continuationSequence`，在 `supplement` 确认受理后重置预算（被拒绝追加与自动续行不重置）
- [x] 2.3 触顶时保留 `BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC`、主动关闭空闲会话进程，并允许 `prepareRelease` / `canRelease` 经真实进程退出核验后释放控制资源

## 3. 应用层保护与前端展示

- [x] 3.1 在 `services/buildr-harness/src/application/conversation-application.ts` 中对上限诊断即时触发空闲源释放，并在 `releaseIdleSources`、`releaseRetiredWork`、`view`、`reconcileReleasedControls` 与 `reconcile` 中保留该诊断且禁止写入自动恢复 `interruption`
- [x] 3.2 在 `services/buildr-harness/src/domain/conversation-continuation.ts` 为上限暂停且无未完成工具的继续草稿生成准确接续提示，并核对 `continueRunId` 接续链路
- [x] 3.3 在 `services/buildr-harness-web/src/features/agent-conversations/conversation-notices.ts` 与 `conversation-state.ts` 中识别上限暂停诊断并呈现明确中文提示与“继续原任务”出口

## 4. 自动化测试与验证

- [x] 4.1 补充 Antigravity 集成测试：验证默认上限为 `20`、受拒追加不重置、已受理追加重置预算且记录序号单调递增、触顶后关闭空闲进程并允许资源释放
- [x] 4.2 补充应用层与前端单元测试：验证触顶后立即释放资源、不触发自动重启恢复、跨代保留原诊断、经 `continueRunId` 可正常恢复以及前端未知状态摘要文案
- [x] 4.3 运行四服务全量静态检查、单元测试与 `verify-impact.mjs` 改动选组检查
