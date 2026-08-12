# Local App 任务复盘筛选

## 摘要

Local App 任务列表新增“任务复盘”筛选，直接按 `task_retrospective_current` 是否存在 current row 查询已复盘或未复盘任务。

## 背景与问题

任务复盘已有独立 SQLite authority，但任务列表此前不能按该事实筛选。用户需要快速区分已有复盘结果和仍未复盘的任务，同时不能把复盘状态复制进 Task Record。

## 目标与非目标

- 支持 `hasRetrospective=yes|no|all`，并在 Local App 提供对应筛选控件。
- 使用现有 Retrospective current row 作为唯一事实，不增加 Task Record 字段或数据库迁移。
- 不改变复盘写入、Task lifecycle、历史复盘、排序或统计。

## 核心流程

用户在任务列表选择“已复盘”“未复盘”或“不限”；Web 客户端将条件传给 Task collection GET，Application 校验参数，SQLite query 使用 `EXISTS` 或 `NOT EXISTS` 返回匹配任务。

## 关键变化

- Task collection GET 接受封闭的 `hasRetrospective` 查询参数。
- 任务列表 Web UI 将筛选状态纳入请求、依赖更新和清除筛选行为。
- 列表 read model 不增加派生复盘字段，不引入第二个 writer。

## 影响、风险与兼容性

省略参数或使用 `all` 保持原有列表行为。查询复用 `task_retrospective_current.task_id` 主键；非法值继续 fail closed。主要风险是客户端控件与服务端参数脱节，由 Web 集成测试和浏览器 Task 流程覆盖。

## 验收摘要

- “已复盘”只显示存在 current Result 的 Task，“未复盘”只显示不存在 current Result 的 Task。
- “不限”和清除筛选恢复不带该条件的列表。
- Local App 构建、Web 集成测试、浏览器 Task 流程和 Product affected verification 通过。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/task-record/spec.md`
- `tasks.md`
