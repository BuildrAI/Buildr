## Context

当前 Workspace Structured Store 同时承担 canonical Workspace、候选 Workspace 和验证 Workspace 的本地读写。`openWorkspaceStructuredStore` 的只读路径会复用 canonicality 检查，而该检查调用 `git rev-parse` 观察 worktree provenance。Local App 已经通过 Workspace registry 将 `workspaceId` 解析为已登记 root，因此读取阶段不需要再次从 Git 推断 root 身份。

本 Change 只收窄读路径和 store 归属边界，不改变 Task current schema、migration 序列或 writer provenance 保护。写入、migration 和其他 filesystem mutation 仍必须保留现有 retained/candidate provenance guard。

## Goals / Non-Goals

**Goals:**

- canonical Workspace 的 structured store 仍唯一位于该 root 的 `.buildr/local/workspace.sqlite`。
- candidate/validation Workspace 只使用自身 root 下的临时 structured store，不得写入 retained canonical store。
- 对已经由 Local App registry 解析出的 root 执行只读 Task/Application 查询时，不调用 Git、worktree 观察或 `git rev-parse`。
- 用 integration/system tests 证明候选 store 隔离、canonical store 不被候选写入，以及 canonical read path 无 Git 依赖。

**Non-Goals:**

- 不新增数据库、表、migration、全局 store 或同步机制。
- 不移除 writable/migration path 的 Git/worktree provenance 校验。
- 不让 Local App 接受任意 `root`、`path` 或 filesystem query，也不改变 Workspace registry 的身份隔离。

## Decisions

### 1. 只读与写入使用不同的 provenance 边界

`assertCanonicalStructuredWorkspace` 在 `writable: false` 时只验证已解析 root 的 Buildr 初始化事实，并缓存当前 operation 的 root identity；它不得调用 `observeCheckout`。`writable: true` 时继续观察 checkout，并执行 linked worktree、candidate runtime 和 writer provenance 拒绝逻辑。

选择在 Structured Store infrastructure 收窄边界，而不是在 Local App 各个 handler 绕过检查，是因为 Task、Development、Verification 和 Review 的只读 Application 都共享同一 repository/store 入口，可以避免产生第二套读路径。root 的可信身份仍由 Local App registry/Application resolver 提供，读取 store 不负责重新发现身份。

### 2. store 归属由 root 作用域决定

canonical、candidate 和 validation Workspace 均使用各自 root 下的 `.buildr/local/workspace.sqlite`。candidate/validation 的 writable action 仍可初始化自己的 store，但当其 runtime 以 retained canonical root 为 target 时，writer provenance guard 必须在任何数据库或目录 mutation 前拒绝。

选择 root-scoped local store 而不是共享临时数据库，是为了让候选验证可以真实覆盖 schema、Task current records 和生命周期读写，同时保证验证失败或放弃不会污染 canonical ledger 与业务数据。

### 3. 通过调用边界测试固定性能与安全契约

集成测试注入会抛错或计数的 `observeCheckout`：只读打开已初始化 root 时必须零调用；writable action 仍必须调用并保留拒绝/允许结果。候选隔离测试检查候选 root 的数据库可写、canonical root 的文件系统内容未变。Local App system test 通过已登记 Workspace 请求 Task 读取，确认该读取不会触发 Git 观察。

## Risks / Trade-offs

- [Risk] 直接调用 store 读接口的调用方可能传入未登记或错误 root。→ 只读路径仍要求 Buildr Workspace 初始化事实；Local App HTTP 继续只接受 registry 解析出的 `workspaceId`，拒绝 root/path 查询参数。
- [Risk] 允许 linked candidate root 只读可能让调用方误把它当 canonical authority。→ store locator 仍是 root-scoped，所有写入/migration 仍受 provenance guard；Application 不改变 authority 标识。
- [Risk] 移除读路径 Git 观察后，Git topology 变化不会即时影响已解析 Workspace 的读取。→ topology 校验只属于写入安全边界；Workspace registry/manifest 负责读取前的 root 身份解析，下一次写入仍重新执行 provenance 校验。

## Migration Plan

1. 更新 Structured Store read/write boundary 与 Local App read-path tests。
2. 在独立 candidate/validation root 初始化并验证自身 store，确认 retained canonical store 无新增文件或数据变化。
3. 完成正式 Verification 后交付 retained runtime；不需要数据库 migration 或数据转换。
4. 若回滚，只需恢复代码版本；现有 `.buildr/local/workspace.sqlite` schema 与数据无需修改。

## Open Questions

无。只读 root 的身份由现有 Workspace registry/Application resolver 提供，写入 provenance 仍沿用现有规则。
