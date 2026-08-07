## Why

Task Environment 的完整事实目前由每个 Task 的 `environment.json` 维护，SQLite 只保存一份可能缺失的生命周期投影；这会让 Local App 无法稳定地从同一份 current 数据读取环境状态。现在需要把 Environment current authority 收敛到 Workspace SQLite，使准备、资源变化和清理进度都能按任务动作实时更新，并让读取路径不再解析 Environment 文件。

## What Changes

- 新增按 `task_id` 唯一绑定的 `task_environment_current` SQLite current table，保存经过 Domain 校验的完整 Environment Receipt 与可查询状态字段。
- 将 Task Environment Application/Repository 的 `prepare`、`inspect`、资源登记/释放和 `cleanup` 切换为 SQLite 唯一读写 authority；每次合法生命周期动作更新同一 current row。
- 保留 `task_lifecycle_current` 作为跨专业聚合读模型，但由 Environment Application 从 SQLite current Environment 生成最新摘要，不再承担完整 Environment authority。
- Local App Environment API 通过 Task Environment Application 读取 SQLite current 数据；HTTP/Web 层不读取、解析或回填 `environment.json`。
- 增加连续 SQLite migration 和一次性受控迁移，将已有合法 `environment.json` 导入 current table；迁移完成后旧文件不再作为 fallback、双写源或读取输入。
- **BREAKING**：`environment.json` 不再是 Environment Receipt authority；新 runtime 不创建、不更新、不解析该文件，Environment 事实不进入 Git 或跨 Workspace 同步。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：将 Environment authority、生命周期写入和 inspect 读取从文件切换到 SQLite。
- `workspace-structured-data-store`：增加 Environment current table、migration、foreign key、writer provenance 与事务约束。
- `task-lifecycle-read-model`：继续维护 Environment 摘要，但明确其来源为 SQLite Environment current row，不允许读取文件回填。
- `public-json-contracts`：将 Environment 结果中的持久化定位从文件 path 调整为 SQLite current locator，同时保持公开结果 schema 与状态语义可兼容。

## Impact

- 影响 Task Environment domain/application、SQLite migrations/repository、lifecycle projection、Local App Environment reader/API、Doctor、migration/package checks 与相关测试。
- 不改变 Task Record、Task Development、Review、Verification、Finish 的专业 authority；不新增第二数据库、事件历史、scheduler 或通用 metadata store。
- 迁移是本机 breaking cutover：新 runtime 只读 SQLite，旧 `environment.json` 只允许在受控迁移窗口作为输入，迁移失败必须保留原文件并阻止切换。
