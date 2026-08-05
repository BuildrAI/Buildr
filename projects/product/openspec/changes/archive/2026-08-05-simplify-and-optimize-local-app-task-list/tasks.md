## 1. SQLite 查询投影

- [x] 1.1 在 Task Record repository 实现封闭 filters、固定批量 relation 查询、派生 `childTaskCount` 与 SQLite filter options，不新增 migration 或持久化计数
- [x] 1.2 在 Task Record Application 增加 Local App list/detail query projection，保持 CLI/Task Manager `inspect` 与五个正式 action 不变
- [x] 1.3 增加数百 Task fixture、查询次数、组合过滤、wildcard/注入、直接 Child 数量和无昂贵 consumer 调用测试

## 2. Local App API 与页面

- [x] 2.1 为 Task collection GET 实现 `q|project|service|status|hasChildren` closed query schema，并删除 Local App Task collection POST route
- [x] 2.2 将 Task 列表改为默认 active 的轻量过滤视图，加入 debounce、loading、竞态防护、过滤选项和派生直接 Child 数量
- [x] 2.3 将 Task 详情首屏改为单 Task stored view，直接构造 Change 链接，并在操作 Parent 字段时延迟加载 active 候选
- [x] 2.4 删除 Local App Task create UI/逻辑，保留 update/complete/abandon 与专业 Tab lazy loading

## 3. 契约与回归

- [x] 3.1 更新公共 JSON/API contract、Local App reference 和 Task Record capability说明，明确 Local App 是观察与有限维护界面
- [x] 3.2 更新 unit、integration、system 与 browser smoke，证明 POST create 不存在而 CLI/Task Manager create 保持可用
- [x] 3.3 运行直接相关 Quick/changed tests，修复所有实现反馈并记录本机 Task list/detail 前后观察值

## 4. 当前认知与 Change 收敛准备

- [x] 4.1 评估并更新 Change Brief、Task lifecycle architecture、Product/technical architecture 和 Buildr Service current knowledge 中真实受影响内容
- [x] 4.2 核对术语、OpenSpec delta、实现、文档、测试与无 migration 边界一致，并通过 strict validation 和 archive readiness 检查
