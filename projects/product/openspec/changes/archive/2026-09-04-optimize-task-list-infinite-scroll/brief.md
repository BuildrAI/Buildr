# 优化任务列表滚动续载

## 一句话摘要

让 Buildr Web 任务信息流每批读取 50 条、浏览到约第 40 条时自动续载，同时移除列表中的 Git、Worktree 与 OpenSpec Change 重型实时解析。

## 背景与问题

当前 Workspace 已有 427 条 Task。原始 SQLite 全量读取约 0.02 秒，但列表对每条 Task 和 269 个 stored Change reference 执行实时引用解析，完整查询超过 40 秒；一次返回和渲染全部数据也不再适合持续增长的任务历史。

## 目标与非目标

目标是恢复轻量 stored-state 列表投影，并让现有信息流以 50 条为一批自动续载。非目标是引入传统页码、虚拟列表、缓存、全文索引或新的 Task authority。

## 受影响用户或角色

使用 Buildr Web 查看大量历史任务的人；Task 详情和具体 Change 页面保持现有实时诊断能力。

## 核心流程

打开任务列表后读取首批 50 条；浏览到约第 40 条时预取下一批并追加。搜索、筛选或 Workspace 变化会取消旧请求并从新查询首批开始。

## 关键变化

- Task Query 列表响应升级为 `buildr.task-record-list/v6`，增加可选游标分页和完整匹配数量。
- Web 固定使用 50 条批次和第 40 条预取位置。
- 搜索与排序迁移到服务端，保持跨批完整语义。
- 列表不再解析实时引用当前性。

## 影响、风险与兼容性

Application 未分页调用继续返回全部匹配 Task；分页只由适配后的 Web 显式启用。滚动期间使用稳定快照游标，刷新或更改筛选后读取最新事实。没有数据迁移和外部依赖。

## 验收摘要

数百条 Task 场景中，首批只返回 50 条；到达约第 40 条自动且只触发一次续载；筛选、搜索、交错响应和续载失败不污染当前列表；列表查询不调用 Git、Worktree 或 Change resolver。

## 技术 artifacts 入口

- [提案](proposal.md)
- [设计](design.md)
- [Task Record 规范增量](specs/task-record/spec.md)
- [Buildr Web Workspace Application 规范增量](specs/buildr-web-workspace-application/spec.md)
