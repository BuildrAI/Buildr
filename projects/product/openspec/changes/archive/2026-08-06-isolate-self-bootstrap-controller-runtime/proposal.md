## Why

Buildr 自举时，候选 worktree 中的 Buildr runtime 目前可以指向 canonical Workspace Structured Store。若候选 migration 先写入主库而源码尚未进入 retained checkout，主库 ledger 会比 retained runtime 更高，合法的版本一致性检查便会阻止真实 Task 继续推进。

现有规则已隔离候选 runtime 投射，却没有为 SQLite mutation 建立同样的 runtime provenance 边界。现在需要把“稳定 controller 写主库、候选 runtime 写任务验证 Workspace”落实为可验证、fail-closed 的产品行为，以支持多个自举任务并发开发。

## What Changes

- 为 canonical Workspace Structured Store 增加 writer provenance guard：来自与 canonical Workspace 共享 Git common-dir 的候选 task checkout/runtime 不得打开、迁移或写入 canonical SQLite；拒绝必须发生在数据库 mutation 前。
- 明确 retained controller 是 canonical Task Record、Development、Review、Verification、Retrospective、Environment、Finish terminal state、Local App mutation 与 canonical migration 的唯一写入执行者；CLI、HTTP 与内部 driver 都必须经过同一 guard。
- 将候选 Buildr 的数据库验证限定为 receipt 绑定的 Task Validation Workspace：验证根拥有独立 SQLite、完整 migration ledger 和测试数据；验证结束或任务放弃时整体丢弃，不向主库合并数据或执行 down migration。
- 明确并发 migration 的集成处理：候选可在隔离库内验证；最终进入 retained branch 前若 migration identity 或内容发生变化，必须从最新基线重建验证库并按影响范围重新验证。未发生实质变化时可复用验证结果并做最终 identity 检查。
- 在 retained source 集成成功后，才允许 retained controller 升级 canonical Workspace 数据库；保留既有连续 migration、checksum drift 与 database-newer-than-runtime fail-closed 语义。
- 为候选 Local App smoke 规定独立 Task Validation Workspace 和端口/资源归属；官方 retained Local App 继续服务 canonical Workspace，不读取候选库。

不包含破坏已有用户 Workspace 的外部 API；这是 Buildr 自举的额外来源隔离与验证边界。不会新增 daemon、服务端、数据库同步、通用调度器、migration 回滚框架或临时数据库合并机制。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: canonical SQLite 的 writer provenance、候选运行时拒绝和主库 migration activation 时机。
- `task-environments`: Task Validation Workspace 的独立结构化存储、候选本地服务资源归属与清理边界。
- `workspace-first-runtime-projection`: 候选/retained runtime identity 在结构化存储操作上的一致隔离。
- `buildr-package-assets`: 自举候选验证、集成后 retained activation 与 package/CLI/Local App 验收边界。
- `agent-task-workflows`: self-bootstrap activation 与最终候选重验证的 workflow 约束。

## Impact

- `services/buildr` 的 SQLite infrastructure、runtime composition、Task Application writer 入口、internal drivers、CLI 与 Local App mutation wiring。
- Task Environment receipt/probe、Task Validation Workspace fixture、候选 Local App smoke 与持久资源 registry。
- 自举开发/收尾流程、migration fixture、SQLite/CLI/HTTP/Local App/Doctor 验证编排，以及产品技术架构知识。
