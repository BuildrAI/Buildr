## Why

当对话在服务重启、进程退休或运行失败后通过“继续上次执行”或自动恢复接续原目标时，前端都会按 `runId` 为接续执行单独新建一个带有“继续上次要求”标签的用户气泡回合，使同一个用户交互在信息流中反复出现重复的用户气泡。此外，服务退休退出（`releaseRetiredWork`）后因缺少系统中断标记且并行新代次未在旧代次退出后重新扫描，导致本来开启自动恢复策略的对话停留在“继续原任务”按钮而不会自动接续。

## What Changes

- **复用同交互接续回合**：当纯接续执行轮沿持久 `continuedFrom` 关系解析出的原始用户输入（或同交互首个接续回合）已在当前可见信息流中时，前端直接将接续通知、交接提示、处理过程与最终答复归入同一 `ConversationTurn` 中，不再重复创建用户气泡或“继续上次要求”回合头部；仅当原始输入早于当前分页窗口且尚未创建该交互回合时，才在固定头部展示来源快照。公开接续通知条目附带轻量 `continuedFrom` 引用以支撑多轮历史分页中的稳定聚合，并相应更新回合计时、折叠状态键与前序中途叙述合并逻辑。
- **服务退休与并行换代自动接续**：`releaseRetiredWork` 与 `releaseIdleSources` 在将受系统中断的在途运行转为 `unknown` 时持久保存系统中断标记 `interruption`；`recoverRun` 兼容恢复带 `RETIRED_EXECUTION_DIAGNOSTIC` 的记录，并在原控制资源已证明释放且原代次已退出时允许新代次接续；并行换代期间，新代次持续关注前任活跃代次退出并触发 `recoverInterrupted()` 自动接续原目标。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 优化纯接续执行轮在同页内的回合复用展示规则，新增服务退休及并行换代后自动核对并接续原目标的要求，并保留手动恢复策略未开启或保护触发时的“继续原任务”出口。

## Impact

- `projects/product/services/buildr-harness`: `contracts.ts`、`operation-schemas.ts`、`persistence/conversation-read-model.ts`、`persistence/conversation-repository.ts`、`application/conversation-application.ts`、`process/server.ts` 及相关单元/集成测试。
- `projects/product/services/buildr-harness-web`: `features/agent-conversations/conversation-state.ts`、`ConversationPanel.tsx` 及 `test/ui/development-process-regression.test.mjs`。
- `projects/product/services/buildr` & `services/buildr-web`: 契约代码生成（`agent-service-http-dto.ts`）与浏览器 E2E 测试 `agent-conversations-history-scenarios.ts`。
