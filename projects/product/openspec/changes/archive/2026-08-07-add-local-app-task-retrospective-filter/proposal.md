## Why

Local App 任务列表目前只能按任务自身的顶层字段筛选，无法快速找到已经完成任务复盘或仍待复盘的任务。复盘已经由 `task_retrospective_current` 独立保存，列表需要消费这一现有事实，而不应在 `tasks` 中复制一个同步字段。

## What Changes

- 为 Local App Task collection GET 增加 `hasRetrospective` 查询条件，支持 `yes`、`no`、`all`。
- 列表查询使用 `EXISTS` / `NOT EXISTS` 直接判断 `task_retrospective_current` 是否存在对应 current row。
- Local App 增加“复盘”筛选控件，并在请求中传递该条件。
- 增加 API、SQLite query projection、Web contract 和浏览器筛选覆盖。
- 不修改 Task Record schema，不增加迁移，不增加第二个复盘状态写入点。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-record`: Task list query projection 和 Local App Task collection query schema 增加复盘存在性筛选。

## Impact

- 影响 `task-record` canonical spec、Local App HTTP query allowlist、Task Record Application filter normalization、SQLite task view query 和任务列表 Web UI。
- 复用 `task_retrospective_current.task_id` 主键索引；不新增数据库字段或数据迁移。
- 现有 Task Record、Task Retrospective Application、详情复盘 API 和写入流程保持不变。
