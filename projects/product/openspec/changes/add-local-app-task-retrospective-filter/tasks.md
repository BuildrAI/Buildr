## 1. OpenSpec 与查询契约

- [x] 1.1 更新 Task Development planning snapshot，记录 proposal、design、delta spec 和 tasks 的 current identities
- [x] 1.2 收敛 `task-record` delta spec 与 current knowledge impact，确认不增加 Task Record 字段或 SQLite migration

## 2. SQLite 与 Application

- [x] 2.1 在 Task Record Application 和 Local App HTTP query allowlist 中增加 `hasRetrospective=yes|no|all` 校验与返回 filters
- [x] 2.2 在 SQLite task view query 中用 `EXISTS` / `NOT EXISTS` 关联 `task_retrospective_current`，保持固定查询次数和主键索引查找
- [x] 2.3 增加有、无、全部和非法复盘筛选值的系统/API测试，并验证 Task Record 与 Retrospective current row 不发生双写

## 3. Local App Web 与验证

- [x] 3.1 在任务列表增加复盘筛选控件、请求参数和清除筛选行为
- [x] 3.2 更新 Local App Web contract 与 browser smoke，验证已复盘/未复盘任务筛选结果
- [x] 3.3 运行 affected verification、Candidate 验证和 Doctor，确认现有 dirty state 未被纳入变更
