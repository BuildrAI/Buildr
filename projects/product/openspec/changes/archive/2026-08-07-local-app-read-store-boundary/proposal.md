## Why

Workspace Structured Store 已经具备 retained canonical writer 与候选验证隔离能力，但只读打开仍统一经过 Git/worktree provenance 观察。Local App 已由 workspace registry 解析出 canonical root 后，Task read path 不应再次执行 `git rev-parse`；同时需要把 canonical 单库与候选/验证临时库的边界写成可验证契约，避免读取优化误伤写入隔离。

## What Changes

- 将 Structured Store 的读取与写入边界分开：只读打开已解析 Workspace root 时不执行 Git/worktree provenance 校验；writable 打开、migration 与 mutation 继续保留 writer provenance guard。
- 明确 canonical Workspace 只使用自身 `.buildr/local/workspace.sqlite`；candidate/validation Workspace 只能使用各自 root 下的临时数据库，不得回写 canonical store。
- Local App 的已登记 Workspace Task read path 继续只调用 Application/read model，不触发 Git `rev-parse` 或 worktree identity observation。
- 增加 canonical read 无 Git 依赖、candidate store 隔离、candidate 写 canonical 被拒绝的回归证据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`：明确 canonical、candidate/validation Structured Store 的读写边界，并将 provenance guard 收窄到写入路径。
- `local-workspace-application`：已解析 canonical root 的 Local App 只读 Task projection 不再执行 Git/worktree provenance 观察。

## Impact

- 影响 `src/infrastructure/sqlite/workspace-sqlite.mjs`、Local App Task read path 和 Workspace/Task Store 测试。
- 不新增数据库表、migration、缓存或第二个 canonical authority。
- 保留所有 writable Task/Review/Verification/Development/Lifecycle writer 的 provenance 与单库约束。
