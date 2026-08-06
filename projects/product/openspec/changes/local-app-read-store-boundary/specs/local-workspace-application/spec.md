## MODIFIED Requirements

### Requirement: Local App Task 视图必须只消费 Workspace structured Task read model
Buildr Local App MUST 继续通过 Task Record Application 列出、查看和维护 Workspace Task，并 MUST 将 SQLite repository 保持为 interface 后的本地 infrastructure。页面和 HTTP interface MUST NOT 读取旧 `task.yml`、打开数据库、执行 SQL、解释 migration ledger 或暴露 database path/table/row id。Local App MUST 先通过已登记 Workspace identity 将请求解析为 root，再由 Task Application 消费该 root 的 structured Task read model；对已经解析 root 的只读调用 MUST NOT 执行 Git/worktree provenance 校验或 `git rev-parse`。Local App 的 Task mutation MUST NOT 添加、移除或以其他方式维护 Change 引用。

#### Scenario: 浏览 SQLite-backed Task 列表
- **WHEN** 用户进入已登记 Workspace 的 Task 列表
- **THEN** API MUST 通过 Task Application 返回该 Workspace root 的 SQLite authority 中真实 Task 的排序 read model
- **AND** 页面 MUST NOT 扫描 `.buildr/tasks/`、合并旧 YAML 或按 Task 专业目录推断缺失记录

#### Scenario: canonical root 读取不依赖 Git
- **WHEN** 已登记 Workspace registry 将 `workspaceId` 解析为 canonical root，且用户读取 Task 列表或详情
- **THEN** API MUST 通过 Application 和 Structured Store 返回 read model
- **AND** 该只读路径 MUST NOT 调用 Git/worktree observer、`git rev-parse` 或重新判断 root provenance

#### Scenario: candidate 或 validation root 读取自身 store
- **WHEN** candidate 或 validation Workspace 已有自身 local structured store，且 Application 读取该 Workspace 的 Task
- **THEN** API MUST 只读取该 root 的 store
- **AND** MUST NOT 打开 retained canonical store 或修改任一 store

#### Scenario: 数据库尚未初始化
- **WHEN** 已登记 Workspace 尚无 structured store 且用户打开 Task 列表
- **THEN** API MUST 返回成功的空 Task 集合
- **AND** GET 请求 MUST NOT 创建数据库、目录或 migration ledger

#### Scenario: 数据库不可用
- **WHEN** Task Application 返回 schema drift、version newer、busy、corruption 或 integrity diagnostic
- **THEN** Local App MUST 显示稳定、可操作的 Workspace Task unavailable 状态
- **AND** MUST NOT 静默显示空列表、自动重建数据库、回退旧 YAML 或把 SQL/本机 path 暴露给浏览器

#### Scenario: Local App 修改 Task
- **WHEN** 用户通过受保护的 Task API 创建、更新、完成或放弃 Task
- **THEN** HTTP interface MUST 只提交明确 action input 和适用的 `expectedRecordDigest` 给 Task Application
- **AND** Local App update input MUST NOT 接受 `addChanges` 或 `removeChanges`
- **AND** HTTP interface MUST NOT 接受 SQL、database path、table、row id、migration version 或完整 next-state document
