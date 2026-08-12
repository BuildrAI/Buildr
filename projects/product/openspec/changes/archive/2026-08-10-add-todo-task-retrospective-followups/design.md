## Context

当前 Task Record 只有 `active/completed/abandoned`：一旦记录意向就被视为已进入正式执行。复盘处置只保存状态和说明，无法表达有效改进由哪个后续 Task 承接。设计必须继续以 Workspace SQLite 为唯一 authority，并保持 TODO 不产生文件系统或专业阶段副作用。

## Goals / Non-Goals

**Goals:**

- 用一个 `todo` 顶层状态保存已接受、未启动的最小意向。
- 用 Task 间的窄多对多关系保存复盘信源，并支持正反向查询。
- 让 Agent 和 Local App 能完成、查看和筛选复盘后续落地。

**Non-Goals:**

- 不建立 action item、通用 Task relation、独立 backlog 或 history store。
- 不为 `todo` 创建目录、Environment、Change、proposal/design 或执行计划。
- 不让 Local App 负责需要 Git 基线和任务分流的激活动作。

## Decisions

1. Task Record 升级为 v2，状态为 `todo | active | completed | abandoned`。`create` 默认仍为 `active` 以保持兼容，显式 `--status todo` 创建待办；`activate` 是唯一 `todo -> active` 动作。`open` 仅是查询值，等于 `todo + active`，不持久化。
2. `todo` 必须 `result=null`、Change 引用为空；Task Environment、Development、Finish 继续只接受 `active`。`todo` 可编辑、放弃，也可仅以 `noChange=true` 完成；终态不可重开，`active` 不回退为 `todo`。
3. 新表 `task_retrospective_sources(target_task_id, source_task_id, created_at)` 保存复盘信源。目标只能是 `todo|active`，源必须是 `completed|abandoned` 且已有 current retrospective；禁止自引用并以联合主键去重。逻辑 Task Record 只返回 `retrospectiveSourceTaskIds`，反向承接列表由查询派生。
4. Task Record Application 是关系唯一 writer。创建 TODO 时可原子写入多个来源；已有 `todo|active` Task 可通过 update 增删来源。Task Retrospective Application 不复制关系，只在 inspect 时组合 Task Record 的反向轻量投影。
5. “处理复盘”仍使用现有 disposition row 保存处理报告，但 Agent 流程必须先输出原始报告或其 current digest 引用，再按当前项目事实重评，并将有效事项关联至已有或新建 Task。没有有效事项时使用 `no-action`；有承接 Task 时才使用 `handled`。
6. Local App 默认 `open`，提供 `open/todo/active/completed/abandoned/all` 过滤。详情展示来源与承接 Task；激活只由 Agent 完成，因为激活前必须执行 Task Triage 的 Git 基线收敛。

## Risks / Trade-offs

- [旧 runtime 无法读取新增 migration] → 延续 schema version fail-closed，并在集成后同步 runtime。
- [来源 Task 后续状态不可变但复盘可能重做] → 关系保持显式可修正，不绑定报告 digest 或行动项 ID。
- [active 默认兼容会让调用方忽略 todo] → CLI/help/Skill 明确只有接受未启动意向时才传 `--status todo`。

## Migration Plan

1. SQLite migration 重建 `tasks` 状态约束并创建来源关系表；既有行原样保留。
2. 原子升级 contract、Skill、CLI、HTTP、Web 和 package/runtime assets。
3. 在隔离 Workspace 验证迁移、状态门禁、关系完整性、Local App 与 package parity；集成后由 retained runtime 执行自举同步。

## Open Questions

无。
