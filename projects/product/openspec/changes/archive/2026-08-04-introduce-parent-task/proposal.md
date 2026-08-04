## Why

Task Record 已进入 Workspace SQLite，本地数据现在具备稳定的关系查询与事务能力，但 Task 仍只能作为彼此孤立的工作身份，无法直接表达“一个协调 Task 管理多个执行 Task”。继续为这一需求建设独立 Board Domain 会提前引入第二套身份、状态与 writer；先引入最小 Parent Task 关系，可以验证 Task 自身是否足以承载协调工作。

## What Changes

- 为 Task Record 增加可空的直接父任务关系，一个 Task 最多有一个 Parent Task，一个 Parent Task 可以拥有多个直接 Child Task。
- Task Manager 的 create/update/inspect/list 与 Local App 共用同一 Application 维护和投影 Parent/Child 关系。
- 拒绝自引用、循环关系、未知 Parent Task、对终态 Task 的关系修改以及陈旧页面覆盖；关系 mutation 与 Task 主记录保持单事务。
- Parent 与 Child 保持独立生命周期：任一方完成或放弃都不自动改变另一方，也不自动汇总专业 Result。
- 使用新的连续 SQL migration 演进 SQLite schema，不修改已发布的 `0000`/`0001` scripts。
- 更新任务生命周期架构讨论稿，把“协调 Task + Parent/Child 关系 + Local App 动态投影”作为当前最小方向，并把独立 Structured Task Board 降为经真实缺口证明后再评估的后续方案。
- 不实现通用依赖图、排序/分组、自动调度、自动完成、跨 Workspace 关系或 Buildr Server/Cloud 协作。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: 扩展 Task Record、关系校验、事务 mutation 与 Local App Parent/Child 管理语义。
- `workspace-structured-data-store`: 要求 Parent Task 通过新的连续 SQL migration 演进，并保持完整性与索引纪律。
- `cli-product-surface`: 扩展既有五个 Task action 的 Parent Task 参数与帮助，不增加新的顶层 action。
- `public-json-contracts`: 让 Task Record JSON 明确返回稳定的 Parent/Child read model。
- `local-workspace-application`: 在 Task 列表、详情和编辑入口投影并维护 Parent/Child 关系。
- `agent-task-workflows`: 让 `task-manager` 通过产品动作管理 Parent Task，不把层级关系升级为调度器或 Board writer。

## Impact

- 数据：新增连续 SQLite migration、Parent Task foreign key/index 和关系查询。
- 产品：Task Domain/Application/repository、CLI、Local App API/Web、Doctor/schema tests。
- 契约：Task Record capability contract、Skill、公开 JSON schema registry 与相关 canonical specs。
- 文档：CLI/架构/限制说明及 `docs/roadmap/task-lifecycle-architecture.md`。
- 兼容性：现有 Task 自动表现为无 Parent Task；旧 YAML 仍不迁移、不读取、不双写。
