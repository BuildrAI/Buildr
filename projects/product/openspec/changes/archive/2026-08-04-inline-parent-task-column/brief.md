# 将 Parent Task 内联到 tasks 表

## 一句话摘要

把标准一对多 Parent Task 关系从独立 `task_parent_relations` 表收敛为 `tasks.parent_task_id` 自引用外键，同时保持 Task Manager、CLI 与 Local App 行为不变。

## 背景与问题

Parent Task 每个 Child 至多一个 Parent，没有关系属性，也不支持多 Parent。独立关系表把简单字段建模成了关联实体，并为尚不存在的多对多或通用图需求提前增加结构。产品仍处于正式发布前阶段，应尽早回到直接的一对多模型。

## 目标

- `tasks.parent_task_id` 成为唯一 Parent 持久化字段。
- latest SQLite Schema 不保留 `task_parent_relations` 表或索引。
- direct Children 使用 `tasks(parent_task_id, task_id)` 索引查询。
- 保持现有关系验证、read model、CLI 与 Local App 契约不变。
- 通过连续 migration 让当前 v2 自举 Workspace 安全进入新 Schema。

## 非目标

- 多 Parent、多对多、关系属性、依赖图或通用 edge 模型。
- Parent/Child 生命周期传播、排序分组或自动聚合。
- SQLite 同步、Server 或 Cloud 数据协议。

## 核心变化

1. `0003_inline_parent_task_column.sql` 新增 nullable self-reference foreign key。
2. 现有 v2 关系复制到 Child row 后，删除关系表并建立主表索引。
3. Task Record repository 直接读写 `tasks.parent_task_id`。
4. fresh/v1/v2 migration tests 验证最终 Schema 与关系保留。
5. canonical spec、技术架构、Service 说明和讨论稿同步新模型。

## 验收摘要

- latest Schema 只使用 `tasks.parent_task_id` 表达 Parent。
- 不存在的 Parent 仍由 foreign key 与 Application 双重拒绝。
- self/cycle/terminal Parent、reparent/clear 和 Parent/Child 独立终态行为保持通过。
- Workspace Structured Store migration ledger、checksum 与 Doctor 保持健康。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/workspace-structured-data-store/spec.md`
- `tasks.md`
