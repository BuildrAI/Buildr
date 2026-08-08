# 任务复盘处置状态

## 一句话摘要

为每份终态 Task 的当前复盘增加轻量处置状态，让人和 Agent 能筛选待处理复盘、明确标记已处理或无需处理，同时保持复盘非门禁和单一 SQLite authority。

## 背景与问题

当前 Task Retrospective 只能回答“是否已有复盘报告”。Local App 已支持已复盘/未复盘筛选，但不能区分报告尚待判断、已经安排后续行动或明确无需行动。随着复盘积累，建议缺少一个可恢复、可筛选的当前处置结论。

## 目标与非目标

目标是增加 `pending | handled | no-action` current metadata、Agent/Application 处置动作、Local App 至少一个“无需处理”入口和统一列表筛选。

本变更不追踪改进 Task 的执行进度，不重开原 terminal Task，不增加历史、审批、评分、批量处理、通知或自动生成改进 Task，也不改变自由 Markdown Result v1。

## 受影响用户与角色

- 人：在 Local App 中筛选待处理复盘，阅读报告后标记已处理或无需处理，也可以重新打开。
- Agent：通过 Task Retrospective provider inspect current 事实，以同一 Application `handle` 动作记录处置决定。

## 核心流程

1. Agent 为 terminal Task 记录复盘，处置状态成为 `pending`。
2. 人或 Agent inspect 当前报告、处置状态与 response-only `currentDigest`。
3. 调用方提交 `handled` 或 `no-action` 以及非空说明；页面明确提供“无需处理”。
4. 如判断需要重新处置，可改回 `pending`；如报告被重新记录，系统自动重置为 `pending`。
5. Task 列表可筛选未复盘、待处理、已处理和无需处理。

## 关键变化

- 同一 `task_retrospective_current` row 增加处置元数据，不复制到 Task Record。
- Application/internal driver/Local App HTTP 共用受控 `handle` mutation 和 current digest 冲突保护。
- Local App 详情增加状态、说明、时间与三个处置入口；列表使用统一复盘状态筛选。
- “已处理”表示已形成处置决定，不表示后续改进完成；实际改进另建正式 Task。

## 影响、风险与兼容性

既有合法复盘在 migration 后全部为 `pending`，没有复盘的 Task 不创建占位。现有 `hasRetrospective` 查询保持兼容，Result v1 不变。旧 runtime 对新 schema 继续 fail closed，不双写或回退读取。

主要风险是页面写入口扩大专业 mutation 面和“已处理”被误解；通过同源/session/字段白名单、expected current digest、非空说明以及统一术语和页面文案约束。

## 验收摘要

- 现有与新复盘默认待处理，重做复盘重置待处理。
- Agent 与 Local App 能原子标记已处理、无需处理或重新打开，陈旧 digest 不覆盖 current。
- 页面明确存在“无需处理”入口并要求理由。
- Task 列表能筛选四类复盘状态，现有是否复盘查询继续工作。
- 处置不改变 Task Record 或任何生命周期门禁。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Retrospective delta spec](specs/task-retrospectives/spec.md)
- [Task Record delta spec](specs/task-record/spec.md)
- [Implementation tasks](tasks.md)
