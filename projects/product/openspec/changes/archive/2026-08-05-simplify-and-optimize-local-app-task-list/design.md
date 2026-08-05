## Context

Task current records 已以 canonical Workspace 的 SQLite 为唯一 authority，但 Local App 仍沿用面向完整 Task inspect 的 read model。列表读取先取 Task ID，再逐条读取 scope、Change 和 Children；Application 随后校验 filesystem registries，并为每个 Change 解析 matching Task Environment、Git worktree 及 retained active/archive 目录。Task 详情首屏还会同时请求完整 Task 列表，只为填充 Parent 编辑候选。

当前专业页签已经按需读取；Finish、Verification 和具体 Change 页面也已经拥有完整 currentness consumer。本设计只收窄 Local App 普通观察路径，不改变这些专业 authority。

## Goals / Non-Goals

**Goals:**

- 让 Local App Task 列表和详情首屏只从 SQLite current authority 构造轻量 read projection。
- 以固定数量、参数化的 SQLite 查询提供列表、直接关系摘要、派生 `childTaskCount` 和封闭过滤。
- 保留 CLI/Task Manager 的五个正式 Task Record action 与完整 inspect 语义。
- 清退 Local App Task create，同时保留其他已授权维护动作。
- 让 Parent 候选、专业 Tab 和 Change currentness 只在用户实际进入对应交互时读取。

**Non-Goals:**

- 不新增 `child_task_count`、migration、物化列表表、ORM、FTS、缓存、后台索引或 query DSL。
- 不增加分页、排序配置、保存筛选器或跨 Workspace 聚合。
- 不改变 Environment、Development、Review、Verification、Finish 或 Task-scoped Change resolver 的语义。
- 不删除 Local App update、complete 或 abandon。

## Decisions

### 1. Local App 使用 Application-owned query projection

Task Record Application 增加面向 Local App 的 stored-state read projection；HTTP interface 不直接访问 repository 或 SQL。列表 projection 返回 Task 的持久化顶层字段、stored Change references、Parent 摘要、派生直接 Child 数量与 terminal result 摘要。详情 projection 额外返回直接 Child 摘要和 `recordDigest`，但不解析 Change availability。

CLI/Task Manager 继续调用现有 `inspectTaskRecord`，因此 Agent 恢复正式 Task 时仍获得当前 Change availability diagnostic。相比给 `inspect` 增加 consumer flag，独立 query projection 能让 Local App 的轻量语义在 Application 边界内显式可测，同时不改变 capability provider 的默认结果契约。

### 2. Repository 用固定批量查询组合 projection

基础 Task 查询使用封闭 predicate；Project、Service、Change relation 使用批量查询后在内存中按 Task ID 组合。Parent 标题/状态与 Child 数量通过 indexed self-reference 查询取得。查询次数只随 projection 类型变化，不随 Task 数量线性增加。

关键词使用参数绑定与 `instr(lower(title), lower(?))` / `instr(lower(intent), lower(?))`，使 `%`、`_` 按普通字符处理。Project、Service 和 has-children 使用参数化 `EXISTS`，避免 JOIN 放大 Task rows。已有 `tasks_parent_task_idx`、scope identity indexes 和 status/update indexes 足够支撑第一版，不新增索引。

### 3. `childTaskCount` 是 read projection 派生值

直接 Child 的唯一持久化事实继续是 Child row 的 `parent_task_id`。列表通过聚合或相关计数派生 `childTaskCount`，详情从同一关系查询得到 `childTaskIds` 与 count。它不进入 `buildr.task-record/v1`、`recordDigest`、SQLite column 或 mutation input。

备选方案是在 Parent row 保存 `child_task_count`。该方案会把一个关系事实变成两个必须事务同步的表示，并引入 migration、漂移诊断和回滚矩阵；当前实测瓶颈来自外部解析而非 indexed count，因此不采用。

### 4. Local App API 接受封闭 filters

`GET /api/v1/workspaces/:workspaceId/tasks` 只接受 `q`、`project`、`service`、`status` 和 `hasChildren`。未知参数、非法 enum 或非 `project/service` Service identity 在调用 Application 前拒绝。Application/repository 无 filter 时返回全部；只有 Web 页面初始显式选择 `status=active`。

列表结果同时从 SQLite scope tables 返回 Project/Service filter options，避免读取 filesystem registries。第一版不开放任意字段、排序或 SQL 表达式。

### 5. Local App create route 完全移除

删除页面创建表单和 Workspace-scoped Task POST route。HTTP interface 不保留隐藏或 deprecated create path；合法写 session 请求也得到 route-not-found。Domain/Application/CLI/Task Manager create 保持不变。

### 6. 昂贵读取只由可见专业交互触发

详情首屏不再请求完整列表。Parent select 初始只展示空值和当前 Parent；第一次 focus 时请求 active Task query projection。Change reference 始终按 stored `project/change` 构造详情链接，点击后再调用现有 Task-scoped Change detail route。

Development、Environment、Evidence 继续在对应可见 Tab 加载，并保留现有 in-flight guard。列表关键词使用短 debounce 和 generation/abort 防护，旧响应不得覆盖新筛选结果。

## Risks / Trade-offs

- [Local App 首屏不再显示 Change 当前 provenance] → 链接仍保留，具体 Change 页面提供权威实时解析和诊断。
- [SQLite projection 与完整 inspect 形成两种 read shape] → 两者由同一 Application 与 repository 组合、共享 Domain record，不形成第二 authority；使用独立 schema 和契约测试区分用途。
- [无分页时极大 Workspace 仍返回较多 rows] → 当前单机规模和本任务边界明确不增加分页；使用数百 Task fixture 验证查询次数与行为。
- [同步 Node/SQLite 请求仍阻塞 Local App event loop] → 本 Change 删除普通路径上的 filesystem/Git/currentness 热点；不借此引入 worker 或异步存储平台。
