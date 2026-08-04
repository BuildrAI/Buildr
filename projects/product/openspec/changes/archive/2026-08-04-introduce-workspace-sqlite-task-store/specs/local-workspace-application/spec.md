## ADDED Requirements

### Requirement: Local App Task 视图必须只消费 Workspace structured Task read model
Buildr Local App MUST继续通过 Task Record Application 列出、查看和维护 Workspace Task，并 MUST将 SQLite repository 保持为 interface 后的本地 infrastructure。页面和 HTTP interface MUST NOT读取旧 `task.yml`、打开数据库、执行 SQL、解释 migration ledger 或暴露 database path/table/row id。

#### Scenario: 浏览 SQLite-backed Task 列表
- **WHEN** 用户进入已登记 Workspace 的 Task 列表
- **THEN** API MUST通过 Task Application 返回 SQLite authority 中真实 Task 的排序 read model
- **AND** 页面 MUST NOT扫描 `.buildr/tasks/`、合并旧 YAML 或按 Task 专业目录推断缺失记录

#### Scenario: 数据库尚未初始化
- **WHEN** 已登记 Workspace 尚无 structured store 且用户打开 Task 列表
- **THEN** API MUST返回成功的空 Task 集合
- **AND** GET 请求 MUST NOT创建数据库、目录或 migration ledger

#### Scenario: 数据库不可用
- **WHEN** Task Application 返回 schema drift、version newer、busy、corruption 或 integrity diagnostic
- **THEN** Local App MUST显示稳定、可操作的 Workspace Task unavailable 状态
- **AND** MUST NOT静默显示空列表、自动重建数据库、回退旧 YAML 或把 SQL/本机 path 暴露给浏览器

#### Scenario: Local App 修改 Task
- **WHEN** 用户通过受保护的 Task API 创建、更新、完成或放弃 Task
- **THEN** HTTP interface MUST只提交明确 action input 和适用的 `expectedRecordDigest` 给 Task Application
- **AND** MUST NOT接受 SQL、database path、table、row id、migration version 或完整 next-state document
