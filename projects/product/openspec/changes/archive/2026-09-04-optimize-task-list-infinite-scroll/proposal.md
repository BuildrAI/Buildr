## Why

当前 Buildr Web 任务信息流在选择“全部”时一次读取并渲染数百条任务，同时列表投影还对每条记录执行文件系统、Git 与 OpenSpec Change 当前性解析，导致 427 条任务的真实工作区查询超过 40 秒。任务规模已经达到此前“暂不分页”风险成立的阶段，需要恢复轻量列表边界并限制单次读取量。

## What Changes

- Task 列表恢复为仅基于 Workspace SQLite 已保存事实与直接关系的轻量投影，不在列表读取中解析 Project、Service、Git、Worktree 或 OpenSpec Change 当前可用性。
- Task list HTTP 接口增加游标分页参数与结果元数据；Buildr Web 每批固定读取 50 条。
- Buildr Web 保持现有信息流滚动方式，在用户浏览到当前批次约第 40 条时自动预取并追加下一批，不显示传统页码控件。
- 搜索、筛选与排序改为服务端统一执行；任一查询条件变化时废弃旧游标和已追加结果，从第一批重新读取。
- 保留单条 Task 与具体 Change 页面上的实时引用解析和局部诊断。
- **BREAKING** Task list response schema version 从 `v5` 升级为 `v6`；同仓 Buildr Web 客户端同步适配。应用内部未分页调用仍保持既有全量语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: Task 列表增加稳定的游标分页、匹配总数与轻量读取约束，并保持未分页 Application 调用兼容。
- `buildr-web-workspace-application`: 任务信息流按 50 条分批读取，在约第 40 条预取下一批，并在搜索或筛选变化时安全重置。

## Impact

- `product/buildr` Service：Task HTTP 契约、生成 DTO、Task Query Application、SQLite repository 与相关系统/契约测试。
- `product/buildr-web` Service：Task API、列表 Hook、信息流页面、加载/空态与前端测试。
- 不新增数据库表、后台任务、缓存、外部依赖或第二套 Task authority。
