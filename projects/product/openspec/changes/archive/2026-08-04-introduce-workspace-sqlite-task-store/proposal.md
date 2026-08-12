## Why

Buildr 单机版开始需要对本地 Task 数据进行稳定的索引、关系查询、聚合和事务写入，现有按 Task 分散的文件存储已经不适合继续承担这类数据库特征明显的需求。现在产品尚未正式发布，可以在不维护旧数据兼容链的前提下建立 Workspace 本地结构化存储，并让 Task Record 成为第一个 consumer，为后续 Parent Task 等模型扩展准备可靠基础。

## What Changes

- 新增 Workspace 本地结构化存储，以每个 canonical Workspace 独立的 SQLite 数据库承载只在单机使用的数据；数据库不进入 Git、不发布、不跨机器同步，也不承担未来组织协作。
- 将 Task Record 的唯一 persistence authority 从 `.buildr/tasks/<task-id>/task.yml` 切换到 SQLite，保持 Task Application、CLI、Local App 和专业 authority 隔离边界。
- 提供随产品交付、按版本排序且可校验的 SQL schema/migration scripts，以及幂等初始化、事务应用、checksum 漂移拒绝、失败回滚和 Doctor 诊断。
- **BREAKING**：不读取、导入或双写既有 `task.yml`；切换后旧文件 Task 数据不可见，当前自举 Task 只通过新 Task Application 显式重建相同 Task ID。
- **BREAKING**：Task Record public result 不再承诺 canonical file path 或 canonical file bytes；`recordDigest` 改为规范化逻辑记录的响应级摘要。
- Task Metadata Publication 不再发布 Task Record；现有 Development、Verification 和 Review 等其他 writer-owned portable records 保持各自 authority，本 Change 不顺带迁入数据库。
- 本 Change 不实现 Parent Task、服务端同步、Buildr Server/Cloud、多人协作或数据库内的通用业务框架。

## Capabilities

### New Capabilities

- `workspace-structured-data-store`: 定义单机 Workspace SQLite 数据库的本地边界、schema scripts、版本演进、事务、完整性检查和诊断。

### Modified Capabilities

- `task-record`: 将 Task Record persistence authority、读取列表、写入安全和 digest 语义从单文件改为 SQLite。
- `task-metadata-publication`: 从 portable publication exact paths 中移除 Task Record，不同步本地数据库。
- `public-json-contracts`: 移除 Task Record result 对 canonical file path/bytes 的承诺并保持发行形态 parity。
- `cli-product-surface`: 调整 Task CLI 的存储相关帮助与结果语义，不暴露数据库内部表、row id 或 SQL。
- `agent-task-workflows`: 更新 Task Manager 与其他 lifecycle consumer 对本地 Task authority、effects 和 publication 边界的约束。
- `local-workspace-application`: 让 Workspace Task 列表与详情只消费 SQLite-backed Task Application read model，并提供数据库不可用诊断。

## Impact

- Product current knowledge、glossary 和技术架构需要区分 Workspace 文件存储与 Workspace 本地结构化存储，并保持 Buildr Server/Cloud 在本 Change 范围外。
- Buildr Service 将新增 SQLite infrastructure、SQL migration assets、数据库 lifecycle/Doctor integration，并替换现有 filesystem Task Record repository。
- Task CLI、Local App API/UI、Task-scoped Change resolver、Environment/Development/Review/Verification consumers、public JSON fixtures、package contents 和自举 runtime 都需要验证新 repository parity。
- 需要明确选择可支持 Buildr 声明 Node 版本和发布形态的 SQLite driver；若改变 Node engine 或引入 native dependency，必须在 design 和 package 验证中显式处理。
