## Context

Task Record 当前由 canonical Workspace 的 SQLite Structured Store 持久化，`tasks` 与 scope/Change 关系表由同一 repository 维护。Task 是宽而薄的工作身份，但当前记录之间没有关系；任务框架讨论稿仍把跨 Task 协调预设为独立 Structured Task Board。用户已经选择先扩展 Task 自身，使一个协调 Task 可以管理直接子 Task，并由 Local App 动态投影层级。

本设计只处理 Workspace 内 Parent/Child Task 层级。Task 的专业模块、状态和 Result 继续由各自 authority 管理，SQLite 仍是单机 local-only 存储。

## Goals / Non-Goals

**Goals:**

- 一个 Task 最多拥有一个直接 Parent Task；一个 Parent Task 可以有多个直接 Child Task。
- create/update/inspect/list、CLI 与 Local App 使用同一 Task Record Application 和事务边界。
- 支持多级层级并完整拒绝自引用和任意深度循环。
- Parent/Child 独立结束，不产生自动状态、Result、Verification 或 Finish 聚合。
- 通过 `0002` 连续 SQL migration 演进 schema，并为 parent/children 查询建立索引。
- 更新任务框架讨论稿，使协调 Task 成为第一选择，独立 Board 只在剩余需求得到证明后再建设。

**Non-Goals:**

- `dependsOn`、`tracks`、多 Parent、通用图、排序、分组、规划占位或调度。
- 自动创建、完成、放弃、验证、交付或清理 Child Task。
- Parent scope 包含 Child scope、状态一致性或专业 evidence 聚合规则。
- 跨 Workspace、Server/Cloud、多机同步或多人并发协作。
- 本 Change 删除现有 task-board Skill、历史 HTML 或 canonical Board specs。

## Decisions

### 1. 关系由专用 `task_parent_relations` 表拥有

新增 purpose-built `task_parent_relations(child_task_id PRIMARY KEY, parent_task_id)`，两个字段都以 foreign key 指向 `tasks(task_id)`；一个 child 因此天然最多有一个 parent，parent 的直接 children 通过 `parent_task_id` 索引查询。它不是带 relation type 的通用 Graph 表，只表达已确认的 Parent Task 语义。

相比直接 `ALTER tasks`，专用表不需要为改变 `tasks.schema_version` check 而重建 `tasks`、`task_projects`、`task_services` 和 `task_changes`，显著降低 migration 风险。两个 foreign key 使用 `ON DELETE CASCADE`：删除 child 会删除其 parent link；删除 parent 也会删除指向它的 links。当前产品没有删除 Task 的公开动作，实际终态仍保留关系。

### 2. 支持任意深度层级，但只投影直接关系

Application 在设置 parent 前沿 `task_parent_relations` 向上遍历，遇到当前 Task 即拒绝循环；自引用是同一检查的最短路径。read model 只返回 `parentTaskId` 与按 Task ID 排序的 `childTaskIds`，不递归嵌入 Task 正文，不返回整棵树，也不缓存祖先或后代闭包。

这允许 Task 管理 Task，同时让查询、摘要与 UI 保持有界。需要树形展开时，客户端按直接关系逐级导航。

### 3. Parent mutation 属于 Child Task 的明确 active mutation

create 可接受可选 `parentTaskId`；update 以互斥的 set/clear 动作修改 parent。Child 必须 active，Parent 必须存在且 active。Parent 进入终态后既有 children 关系仍保留并可读取，但不能再挂入新 child。终态 Child 不能 reparent 或 clear。

选择该规则是为了保持终态 Task 不可修改，并防止已结束协调 Task 的范围被事后扩张。没有采用“Parent 终态自动结束 Child”或“Child 全部结束自动完成 Parent”，因为状态只表达各 Task 自身的明确顶层处置。

### 4. 关系与主记录使用同一 transaction 和 digest

create/update 在同一 SQLite transaction 中校验 Parent、循环和 expected record digest，再写主记录。`recordDigest` 覆盖 `parentTaskId` 与 `childTaskIds`，因此 Local App 中任一直接关系变化会使相关页面 mutation fail closed。

由于新增/移除 child 会改变 parent 的反向 read model，repository mutation 后按需返回最新 parent/child 投影；不引入持久 revision、事件表、锁或 CAS。

### 5. Schema 与公开契约按 prerelease 事实演进

新增 `0002_create_parent_task_relations.sql`，不得改写 `0001`。migration 建立两个 Task foreign keys、`child_task_id` primary key 与 `parent_task_id` children index。现有 rows 没有 relation rows，无需数据搬迁或主表重建。

Task Record v1 在当前 prerelease 阶段扩展 Parent/Child 字段，公开 operation/list result 升级为新的 major identity；不提供旧 YAML 或旧 JSON 双写。Capability contract 与 Task Manager Skill 同步描述新字段和动作。

### 6. 协调 Task 替代 Board 的范围有限

任务框架讨论稿把“协调 Task + Parent/Child + Local App 动态投影”设为当前最小架构。独立 Board 不在本 Change 删除：只有当真实需求证明必须保存尚未 Task 化的规划项、一个 Task 被多个协调对象组织、显式依赖条件、稳定排序/分组或跨 Task 决策记录时，再评估独立 Board Domain。

## Risks / Trade-offs

- [直接 children 变化使 Parent read model digest 改变] → digest 包含排序后的 direct IDs，Local App 冲突时刷新，不引入持久 revision。
- [深层循环检查成本随层级增长] → Workspace 本地 Task 数量有限，使用 indexed parent lookup 和有界 visited set；发现已有损坏循环时 fail closed。
- [Parent 终态后 Child 仍 active 可能看似不一致] → 这是有意的独立生命周期；UI 明确展示状态，不自动修复。
- [单 Parent 不能表达多个协调视角] → 第一版刻意约束；出现真实多归属需求后再评估 Board 或独立关系模型。
- [公开 JSON major 变化影响脚本] → 产品尚处 prerelease，同 Change 更新 schema registry、契约、tests 和 docs，不维护双版本 writer。

## Migration Plan

1. 交付并校验 `0002_create_parent_task_relations.sql`，现有 Task rows 保持没有 Parent relation。
2. 更新 Domain、repository、Application、CLI、HTTP/Web 和契约/tests。
3. Doctor/Task read 首次打开现有数据库时自动原子应用 `0002`；checksum 或 integrity 异常继续 fail closed。
4. 若 migration 失败，SQLite transaction rollback `0002`，保留 version 1 和全部既有 Task；修复只能通过新的连续 migration，不改写已应用 script。

## Open Questions

无。多 Parent、依赖与独立 Board 是否必要，留给后续真实场景验证。
