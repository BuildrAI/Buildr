## Context

Local App 的任务列表由 Task Record Application 提供轻量 SQLite projection。当前 `tasks` 表保存 Task 顶层事实，`task_retrospective_current` 由 Task Retrospective Application 独占写入，并以 `task_id` 为主键保存每个 Task 的至多一份 current Result。列表查询已经在 SQLite 中完成 q、Project、Service、status 和 Child 条件过滤。

需求只是查询“是否存在复盘”，不是改变 Task 生命周期或复盘数据模型。SQLite 支持与 MySQL 相同语义的相关 `EXISTS` 子查询；`task_retrospective_current.task_id` 的 PRIMARY KEY 可用于存在性查找。

## Goals / Non-Goals

**Goals:**

- 让 Task list API 和 Local App 按复盘 current row 的存在性筛选。
- 保持 Task Record 与 Task Retrospective 的单一 authority 边界。
- 保持无复盘、已复盘和全部三种列表语义，并拒绝非法 query value。
- 让列表 SQL 查询次数与 Task 数量无关。

**Non-Goals:**

- 不在 `tasks` 增加 `has_retrospective` 或类似字段。
- 不改变复盘记录、Task 状态、复盘写入事务或详情 API。
- 不增加历史复盘、聚合统计、排序或新的复盘 writer。

## Decisions

### 使用 `EXISTS` 而不是持久化布尔字段

Task list query 对每个候选 Task 使用 `EXISTS` 或 `NOT EXISTS` 关联 `task_retrospective_current`。该表的 `task_id` 是主键，SQLite 可以按索引完成存在性查找；查询结果直接反映当前 authoritative row。

增加布尔字段会把同一事实复制到 `tasks` 和 `task_retrospective_current`，要求首次记录、替换、失败回滚和未来清理都维护双写，且需要迁移和回填。当前列表需求不足以承担这份一致性成本。

### 查询参数使用 `hasRetrospective=yes|no|all`

参数命名与已有 `hasChildren` 条件保持一致。省略参数与 `all` 等价；HTTP 层继续使用封闭 query schema，Application 负责值校验，repository 只接收规范化后的过滤器。

### 不在每个 Task read model 增加派生字段

本 Change 只增加查询条件。列表返回的 Task read model 不增加 `hasRetrospective` 字段，避免把一次查询投影误认为 Task Record 持久事实；用户可以通过筛选结果和详情的复盘 Tab 查看详情。

## Risks / Trade-offs

- [列表数据量很大时每个候选 Task 都会进行一次主键存在性判断] → 复用 `task_id` 主键索引，并通过现有列表查询的固定 SQL 计数测试验证不产生 N+1 的应用层查询。
- [current row 损坏或表不可用时列表可能查询失败] → 保持现有 SQLite fail-closed 行为，不回退到猜测字段或静默显示错误结果。
- [用户可能希望在列表直接看到复盘状态] → 当前范围只增加筛选；如果后续需要展示列，可在同一 authoritative query projection 上增加派生值，不新增持久字段。

## Migration Plan

无需数据迁移。实现发布后，已有 `task_retrospective_current` rows 自动参与查询；没有该 row 的 Task 视为未复盘。回滚只需回滚代码和 API query contract，不触碰 SQLite 数据。

## Open Questions

无。
