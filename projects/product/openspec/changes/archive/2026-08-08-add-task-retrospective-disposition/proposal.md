## Why

当前任务复盘只能表达“有没有报告”，无法区分报告尚待处置、已经形成处置决定或明确无需行动。随着终态 Task 和复盘积累，Local App 与 Agent 都需要一个轻量、可筛选且不进入 Task 生命周期门禁的处置闭环。

## What Changes

- 在同一 `task_retrospective_current` current row 中增加 `pending | handled | no-action` 复盘处置状态、处置说明与处置时间；现有复盘迁移为 `pending`，没有复盘的 Task 仍保持 absent。
- Task Retrospective Application 增加受控处置动作；Agent 内部 driver 与 Local App mutation 都调用同一 Application，不直接写 SQLite。
- `handled` 与 `no-action` 必须提交非空处置说明；重新记录复盘时自动重置为 `pending`，且处置 mutation 使用 response-only current digest 防止覆盖更新后的复盘。
- Local App 复盘详情至少提供“无需处理”入口，并同时支持“已处理”和“重新打开”；页面只维护处置元数据，不编辑或生成复盘 Markdown。
- Task 列表增加闭合的复盘状态筛选，统一覆盖未复盘、待处理、已处理和无需处理；保留现有 `hasRetrospective` 查询兼容性。
- “已处理”只表示复盘已经形成处置决定；实际改进仍通过新的正式 Task 推进，原 terminal Task 不重新打开。
- 复盘处置继续保持非阻塞，不成为 Task terminal、Development、Finish、cleanup 或 OpenSpec gate。

本变更不包含破坏性公开接口变化；SQLite migration 与同版本 Local App/runtime 一起交付，旧 runtime 对更新后的 schema 继续 fail closed。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-retrospectives`: 增加复盘处置 current metadata、受控 mutation、并发保护、重做复盘重置和 Local App 处理入口。
- `task-record`: 增加复盘状态列表筛选，同时保持 Task Record 不复制 Retrospective 专业事实。

## Impact

- Product OpenSpec：`task-retrospectives`、`task-record` delta specs，术语和 Local App/Service 当前知识。
- Buildr Service：Task Retrospective domain/application/repository/internal driver、SQLite migration、Local App HTTP API、Task 列表查询与 package contracts。
- Buildr Web Service：任务列表复盘状态筛选、复盘详情处置控件与冲突刷新体验。
- 验证：domain、repository、Application、HTTP/Local App、React 与 Browser/changed-path 相关测试。
