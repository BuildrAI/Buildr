## Why

Task Record 已经以 Workspace SQLite 为本地 authority，但 Development、Verification 与 Review 的 current records 仍保存在 File Store，并为此额外建设了 Git Metadata Publication。产品尚未正式发布，现在应在不迁移旧数据的前提下收敛为一套本机持久化 authority，避免继续扩大双存储与 Git metadata 协作模型。

## What Changes

- **BREAKING**：Task Development current Receipt、Task Verification current Result、Planning/Completion Review current Result 改为只读写 `.buildr/local/workspace.sqlite`；旧 YAML 不读取、不迁移、不双写。
- 通过连续 SQLite migration 增加三个窄 current-state 表，并以 `tasks(task_id)` 外键、唯一 current slot、事务替换和 Domain closed schema 校验保护完整性。
- 保持 Development、Verification、Review 各自独立 Domain、Application 与唯一 writer；Local App、Candidate、handoff 和 Finish consumer 继续通过 Application 组合，不直接访问 SQL。
- **BREAKING**：整体删除 Task Metadata Publication Skill、capability contract、binding、helper、package/runtime 投射、专项测试与当前产品文档；Git Operations 不再承载 Task metadata consumer route。
- 更新 Task lifecycle 讨论稿、current knowledge、canonical specs、CLI/架构文档与验证，明确单机 SQLite authority 和未来 Server/Cloud 的边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: 把全部 Task current records 纳入本机 SQLite authority，并约束最小 current-state schema。
- `task-development`: current Receipt 从 portable YAML 切换到 SQLite，移除 publication path 契约。
- `task-verification`: current Result 从 portable YAML 切换到 SQLite，移除 publication path 契约。
- `task-review-results`: 两个 current Result 槽位从 portable YAML 切换到 SQLite，移除 publication path 契约。
- `task-record`: 移除portable publication declaration语义，明确全部Task current records的本机边界。
- `task-metadata-publication`: 删除全部现行 requirements，清退该 capability。
- `agent-task-workflows`: 移除 Metadata Publication 的入口路由与组合职责。
- `buildr-package-assets`: 停止交付 Metadata Publication Skill、contract、binding 与 runtime 资产。
- `openspec-deterministic-sync`: 当一个 capability 的全部 Requirements 被安全清退时，原子删除其 canonical spec，避免无效空壳阻塞 strict validation。

## Impact

- SQLite migration、Workspace Structured Store、三个专业 repository、composition root 与相应 unit/integration/system/static tests。
- Task Development、Verification、Review 的内部持久化 locator 会从 YAML path 变为 SQLite logical locator；既有公开 JSON schema identity 和专业语义保持不变。
- package/workspace Skill manifests、capability graph、Git Operations consumer 描述、runtime projection 与 Doctor/package validation。
- canonical specs、current knowledge、Task lifecycle 架构讨论稿、CLI/reference/known limitations/Roadmap；以及直接阻塞 capability 清退的 deterministic convergence 删除语义。
- Environment Receipt、Task Finish run/result、Delivery Carrier、日志与外部工具产物保持现状；不设计 Buildr Server/Cloud schema、API 或同步协议。
