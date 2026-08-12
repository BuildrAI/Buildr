## REMOVED Requirements

### Requirement: Environment current migration 必须隔离旧文件输入
**Reason**: 一次性 Environment file importer 已退出，Workspace Structured Store 的正常打开、migration、读写与 sync 都不再存在旧文件输入边界。

**Migration**: `task_environment_current` 继续保留既有 SQLite rows 和 schema；旧 `environment.json` 不再读取、导入、删除或作为 fallback，由 Workspace owner 在确认 current row 后自行处理。
