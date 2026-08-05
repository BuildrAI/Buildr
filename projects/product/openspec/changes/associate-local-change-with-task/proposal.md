## Why

Local App 的全局 Change 详情能够继续或审查 Change，但用户只能返回 Task 详情后手工编辑引用，无法在当前上下文把 Change 交给一个已有的正式 Task。这个缺口会把同一个 Change 的发现和任务归属割裂；同时，补入口不能重新引入 Task 列表逐项解析 Environment、Git 或 Change currentness 的首屏性能问题。

## What Changes

- 在 retained Workspace 的全局 Change 详情提供“关联到已有 Task”操作。
- 操作只读取轻量的 active Task Record 查询投影，并提交带 `expectedRecordDigest` 的 `addChanges` mutation。
- 关联成功后回到 Task 详情；Change 仍由 OpenSpec 维护，Task Record 只保存 `project/change` 引用。
- 没有 active Task 时提供交给 Agent 创建 Task 的受限 prompt，不在 Local App 中创建正式 Task。
- 保持全局 Change collection retained-only；不扫描 Task Environment，不复制或移动 Change artifacts。
- **BREAKING** 无。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-workspace-application`: 全局 Change 详情增加按需关联已有 active Task 的交互，同时保持 Task 列表/详情首屏的轻量读取边界。

## Impact

- Local App Change detail Web feature、相关样式和受保护 HTTP/API 调用。
- Task Record Application 的既有轻量查询投影和 `addChanges` mutation；不新增持久化 authority。
- `local-workspace-application` delta spec、Local App 集成测试和产品浏览器 smoke 覆盖。
