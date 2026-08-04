## Context

Parent Task 的逻辑契约是标准的一对多自引用：一个 Child 至多一个 Parent，一个 Parent 可有多个直接 Children。当前 SQLite v2 却通过 `task_parent_relations(child_task_id, parent_task_id)` 保存关系，这种物理模型更接近可独立演进的关联实体，与当前简单字段语义不匹配。

Workspace Structured Store 使用带 checksum ledger 的连续 migration，已应用的 migration 不得改写。虽然产品尚未正式发布，当前自举 Workspace 已存在 v2 数据库，因此新实现既要收敛最终 Schema，也要避免制造 checksum 漂移或假健康状态。

## Goals / Non-Goals

**Goals:**

- 让 `tasks.parent_task_id` 成为 Parent Task 关系的唯一持久化字段。
- 最终 Schema 不保留 `task_parent_relations` 表及其索引。
- 保持现有 Application、CLI、Local App read/write contract 与循环保护不变。
- 让 v2 Workspace 可确定性升级到新 Schema，fresh Workspace 最终得到同一结构。

**Non-Goals:**

- 不引入多 Parent、多对多关系、relation type、edge metadata 或通用图模型。
- 不改变 Parent/Child 生命周期独立性、终态规则或直接关系 read model。
- 不把 Workspace SQLite 变成同步、Server 或 Cloud 协议。

## Decisions

### 1. Parent foreign key 内联到 `tasks`

新增 nullable `tasks.parent_task_id`，以 self-reference foreign key 指向 `tasks(task_id)`。`NULL` 表示独立 Task；非空值表示唯一直接 Parent。Parent 被底层删除时使用 `ON DELETE SET NULL`，避免删除 Child Task；产品 Application 当前不提供 Task 删除动作。

这比独立关系表更直接地表达一对多：Child row 拥有 foreign key，唯一 Parent 不需要额外 primary key 或关联实体。备选方案是继续保留 `task_parent_relations`，但它只在关系自身有属性、多 Parent 或通用关系扩展时更有价值，这些都不在当前范围。

### 2. Children 查询使用主表索引

建立 `tasks_parent_task_idx(parent_task_id, task_id)`。直接 Children 查询使用 `WHERE parent_task_id = ? ORDER BY task_id`，祖先遍历读取 `tasks.parent_task_id`。Application 继续负责 active Parent、自引用和任意深度循环校验；foreign key 与 column check 提供底层完整性防线。

不增加闭包表、递归缓存或通用 edge index。

### 3. 通过不可变 `0003` 收敛已应用 v2

保留已发布到自举 Workspace 的 `0002_create_parent_task_relations.sql` 原始 bytes 和 checksum。新增 `0003_inline_parent_task_column.sql`：

1. `ALTER TABLE tasks ADD COLUMN parent_task_id ...`；
2. 将现有 `task_parent_relations` 值复制到 Child row；
3. 删除旧关系表；
4. 建立 `tasks_parent_task_idx`。

因此 latest Schema 中不存在关系表。fresh database 虽按连续历史执行 `0002` 和 `0003`，事务完成后的可观察结构与 v2 upgrade 一致。直接改写 `0002` 会令已登记 checksum 的 Workspace fail closed；重置本地数据库会无必要地删除当前 Task 数据，均不采用。

### 4. 公共 Task 行为保持不变

repository 的 read/write、digest、transaction 和 error mapping 继续返回相同 `parentTaskId` / `childTaskIds`。仅 SQL 从关系表切换到 `tasks` row；Local App、CLI 与 Task Manager 无需新增字段或分支。

## Risks / Trade-offs

- [SQLite `ALTER TABLE ADD COLUMN` 的 self-reference/check 兼容性] → 使用 Workspace 声明的 Node/SQLite runtime 执行集成测试，并覆盖 fresh、v1、v2 到 latest 三条路径。
- [复制关系后删除旧表可能丢失数据] → 在同一 migration transaction 内先复制，再依赖 foreign key/check 验证；测试构造真实 v2 Parent/Child 后升级并回读。
- [fresh database 会短暂创建再删除历史表] → migration history 保持不可变，验收以 transaction 完成后的 latest Schema 为准；正式发布前如要压缩历史，另行做明确的 pre-release schema squash，不在本 Change 改写 ledger 语义。
- [查询计划退化] → 对 `tasks(parent_task_id, task_id)` 建立稳定索引，并在集成测试核对索引存在。

## Migration Plan

1. 新增并登记 `0003_inline_parent_task_column.sql`。
2. repository 切换到 `tasks.parent_task_id`。
3. 更新静态 migration 清单与 fresh/v1/v2 upgrade tests。
4. 当前认知与讨论稿改为内联 foreign key 模型。
5. retained 激活后由 writable store open 应用 v3，并由 Doctor 验证 version、integrity 与 migration ledger。

回滚不改写已应用 migration。若 v3 实现需要撤回，使用新的 forward migration 恢复目标结构；产品正式发布前可在单独决策下重建 pre-release baseline。

## Open Questions

无。
