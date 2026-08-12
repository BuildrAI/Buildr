## Why

Local App 的 Task 列表和详情首屏当前把轻量观察请求升级为 Environment、Git worktree、OpenSpec Change currentness 与专业结果的实时解析，导致只有少量 Task 时列表仍需约 2 秒。与此同时，Local App 直接创建正式 Task 与“由 Agent 根据用户意图建立正式 Task”的产品边界不一致。

## What Changes

- 为 Local App 提供由 Task Record Application 持有的 SQLite 轻量查询投影，列表和详情首屏只读取 current record、直接关系摘要与已保存引用，不执行外部 currentness 检查。
- 为 Task 列表增加封闭的关键词、Project、Service、status 与是否有直接 Child 过滤；Local App 默认选择 `active`，Application 未传过滤时继续保持全量兼容语义。
- `childTaskCount` 只作为查询时派生的直接 Child 数量进入 Local App read projection，不进入 `buildr.task-record/v1` closed record，也不新增持久化列。
- Parent 候选只在用户操作 Parent 字段时延迟加载；专业 Tab 和具体 Change 页面继续按需执行实时读取。
- **BREAKING** 删除 Local App 的 Task 创建 UI 与 POST route；Task Record Domain/Application、CLI 和 Task Manager Skill 的创建能力保持不变。
- 保持 Finish、Verification、Development、Review、Environment 与 Task-scoped Change detail 的 fail-closed currentness 语义不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: 收窄 Local App 的 Task 列表/详情 read model，增加封闭过滤和派生直接 Child 数量，并清退 Local App Task 创建入口。

## Impact

- Product spec：`openspec/specs/task-record/spec.md`。
- Application/Infrastructure：Task Record Application、SQLite repository 与公共 JSON read model。
- Local App：Task list/detail Web feature、Workspace-scoped HTTP API、帮助与架构说明。
- Tests：SQLite 查询结构、过滤安全、Local App route/UI、lazy loading、专业 currentness 无回归和浏览器 smoke。
- 不新增数据库 migration、ORM、FTS、缓存、后台索引、分页、通用查询 DSL 或第二套 Task authority。
