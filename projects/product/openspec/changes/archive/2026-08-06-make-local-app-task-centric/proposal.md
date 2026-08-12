## Why

Local App 当前把 Change 作为独立资源目录和详情页，而 Task 详情只把关联 Change 显示为技术引用。这让同一项工作在两个入口间分散，也让用户先理解 Change 而不是正在推进的任务。现在需要将 Local App 收敛为以 Task 为中心的只读工作视图，让任务概览先呈现关联 Change 的人类可读 Brief，再按需查看其余任务事实。

## What Changes

- 移除 Local App 独立的 Change 导航、目录、全局详情页和从页面创建、关联或推进 Change 的操作。
- 将已关联 Change 保留为 Task 的只读子资源；Task 概览优先展示可用 Change Brief，并从该 Task 上下文进入完整 Change artifacts。
- 保持 Change 由 Agent 在正式 Task 过程中创建、修订和处置；Local App 不创建、关联、修改、推进或推断 Change。
- 未关联真实 Task 的 Change 不纳入本次 Local App 视图与处理范围。
- **BREAKING**：原 `/changes/...` Local App 页面路由和其面向用户的全局 Change 浏览流程退出；用户改从关联 Task 进入 Change 内容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-workspace-application`: Local App 的 Change 可见性、导航和 Task 概览从独立 Change 管理改为 Task-scoped 只读展示。

## Impact

- Local App HTTP/Web 路由、侧边栏、Task detail read model 与 Change 展示组件。
- `local-workspace-application` canonical spec、Local App integration tests 与 browser smoke。
- OpenSpec Change 的 source authority、Task Record Change 引用与 Agent 研发流程保持不变。
