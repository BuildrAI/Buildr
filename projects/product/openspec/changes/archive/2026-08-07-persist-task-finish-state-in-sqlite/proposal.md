## Why

Task Finish 已经是固定五阶段、可恢复且会形成终态交付证明的产品执行器；本 Change 将其结构化状态统一收敛到 Workspace SQLite，并退出旧的 `.buildr/task-finish/` 文件协议。

现在应保留 Task Finish 的专业名称、Skill 路由和交付/清理职责，只重构其本机持久化与保留边界：结构化 current 状态进入 Workspace SQLite，原始诊断保持临时文件，Finish 成功后只留下精简终态证明。

## What Changes

- 保留 `task-finish` Skill、`buildr.task-finish/v1` capability、`buildr task finish run|inspect` 以及 `preflight → prepare → verify → deliver → cleanup` 五阶段语义，不把交付职责并入 `task complete`。
- 让 Workspace SQLite 成为 Task Finish run/checkpoint、resume、lease、completion 和终态交付 Result 的唯一持久化 authority；Task Finish Application/CLI/Local App 只通过该结构化存储读写。
- 原始 stdout/stderr、完整命令诊断和隔离 Delivery Carrier 继续作为 run-owned transient data；SQLite 只保存有界摘要、identity、大小、digest、定位和 retention/cleanup 状态。
- Finish complete 前，持久 checkpoint 支持 blocked/failed/retry、target-race、Delivery Adaptation、远端回读和 Environment cleanup 的精确恢复；Finish complete 后，原子保留精简终态交付证明，并确定性删除该 run 的 checkpoint、lease、Carrier 与 transient diagnostics。
- **BREAKING**：移除 `.buildr/task-finish/runs`、`completed` 和文件 lease 作为 current authority；新 runtime 不再双写或长期兼容读取旧 run/completion 协议。
- 启用 SQLite-only runtime 前直接清理旧 `.buildr/task-finish` 目录；不迁移、不导入、不恢复旧 run、completion、token 或 checkpoint。新 runtime 不读取、不扫描、不写入该目录。
- Doctor 增加 SQLite Finish schema、current run、一致性、orphan transient data 与 cleanup_pending 诊断；不得把数据库或 Finish 状态加入 Git、publication 或跨机器同步。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：将 run/checkpoint/resume/lease/completion/Result authority 从 `.buildr/task-finish` File Store 收敛到 Workspace SQLite，并定义成功后的 transient cleanup 与旧目录直接退役。
- `workspace-structured-data-store`：增加 Task Finish current/terminal schema、事务和 retention metadata，同时保持 canonical writer provenance、单机单库与无 Git/同步边界。
- `task-environments`：保持 Environment cleanup 唯一 authority，并明确 Finish 在 SQLite durable completion 与 Environment cleanup 之间的可恢复、幂等交接和最终临时数据回收。
- `agent-task-workflows`：保留 `task-finish` 的“收尾/交付”语义入口，明确 `task complete` 只表达 Task Record 终态，且 Skill/Agent 不接触 SQLite 或自行清理 Finish 文件。
- `local-workspace-application`：终态交付与 current Finish 投影改为消费 Task Finish Application 的 SQLite read model，不再扫描或配对 run/completion 文件。

## Impact

- 影响 Task Finish Application、五阶段执行器、run/result repository、target lease、Terminal Delivery projection、Local App Task detail、Doctor 和 Workspace SQLite migrations。
- 影响 `task-finish` Skill/contract、CLI JSON schema 文档、package/runtime 投射、Task Environment cleanup handoff 与自举 post-Finish activation 输入。
- 需要覆盖正常完成、blocked/resume、target-race、Delivery Adaptation、远端回读失败、Environment 已清理但 Finish 未完成、进程崩溃恢复、SQLite busy/corrupt、旧目录不可见和 transient cleanup 的集成/System 验证。
- 不引入 Server/Cloud、团队同步、第二数据库、通用 scheduler、历史事件平台或长期 JSON/SQLite 双写。
