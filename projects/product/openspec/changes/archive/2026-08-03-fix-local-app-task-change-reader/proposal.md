## Why

安装版 Local App 的产品实现根与 Task Environment Receipt 创建时记录的 retained Buildr sourceRoot 不同。当前 `inspect` 错把只读调用方当作 Environment mutation manager 校验，导致本应可读的 matching worktree 被报为 manager mismatch，Task 详情因此回退到 retained Change，无法展示仅存在于候选 worktree 的 Change。

现在需要把只读读取边界与写入 manager 边界明确分开，既让 Local App 如实投射 Task 的候选 Change，又不扩大任何 Environment mutation 权限。

## What Changes

- 让 Task Environment Application 的只读 `inspect` 通过 Receipt 已登记的 controller 对 matching Task Environment 做既有有界 probe，而不要求 Local App/bundle 自身成为 retained Environment Manager。
- 保持 `prepare`、resource register/release 与 `cleanup` 继续由可信、干净、canonical retained Environment Manager fail-closed 执行。
- 让 Task-scoped Change resolver 和 Local App 在安装版运行时仍可从 matching execution root 返回 candidate Change；全局 Change collection 继续 retained-only。
- 补充 bundle/runtime root 与 Receipt controller 不同的回归测试，以及 mutation 边界未放宽的测试。

不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`: 明确只读 `inspect` 的 Receipt-controller 信任边界，并保持 mutation manager 的独占边界。
- `change-asset-indexing`: 保证 Task-scoped Change 在安装版 Local App 的已登记 Task context 中仍从 candidate execution root 投射，且不影响 retained-only 全局索引。

## Impact

- `services/buildr/src/application/task-environment/task-environment-application.mjs`
- `services/buildr/src/application/change/change-application.mjs` 的既有 resolver 行为与 Local App HTTP 投射
- Task Environment controller 与 Task-scoped Change/Local App 的集成测试
- 无新增外部依赖、无新的持久状态或公开 mutation command。
