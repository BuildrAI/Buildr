## Why

当前 Parent Task 是标准的一对多自引用关系，但 SQLite 持久化额外引入了 `task_parent_relations` 表，使简单关系被建模成独立关联实体。产品尚未发布正式版，现在应收敛为更直接的 `tasks.parent_task_id`，避免把未来可能的多对多或通用关系需求提前带入当前模型。

## What Changes

- 将 Parent Task 的持久化所有权移入 `tasks.parent_task_id`，以 nullable self-reference foreign key 表达“一个 Child 至多一个 Parent”。
- 为 `tasks.parent_task_id` 建立直接 Children 查询索引，并继续由 Application 拒绝 terminal Parent、自引用和祖先循环。
- 删除最终 Schema 中的 `task_parent_relations` 表及其索引，更新 repository、migration、静态校验和测试。
- 保持 Task Record、CLI、Local App 的 `parentTaskId` / `childTaskIds` 契约及生命周期独立性不变。
- 更新 Parent Task 的设计说明、当前认知和任务生命周期架构讨论稿。
- **BREAKING**：Workspace Structured Store 的内部 SQLite Schema 从独立关系表切换为 `tasks.parent_task_id`；该本地数据库未作为发布或同步协议。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: Parent Task 的物理 Schema、migration 与索引契约改为 `tasks.parent_task_id` 自引用列。

## Impact

- 影响 `workspace-structured-data-store` canonical spec、SQLite migrations、Task Record repository、package static validation 与 SQLite/Task Record tests。
- 影响 Buildr 技术架构、Service 数据说明和任务生命周期架构讨论稿；历史 Parent Task archive 保持原始决策记录，由本 Change design 明确取代其当前实现结论。
- 不改变 Task Record v1、公共 JSON、CLI 参数、Local App API/UI 或 Parent/Child 生命周期语义。
