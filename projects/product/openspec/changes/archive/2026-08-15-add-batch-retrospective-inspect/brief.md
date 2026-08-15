# 复盘批量只读检查

## 一句话摘要

为 Task Retrospective 增加有界的内部批量只读入口，减少逐个 Task 启动 driver 的重复成本。

## 背景与问题

当前处理多份 pending 复盘时，只能逐个 Task 调用 `inspect`。当待处理数量较多时，重复进程启动、参数组织和结果拼接会放大时间与上下文成本，但单份复盘的 current authority 和处置授权边界本身没有问题。

## 目标与非目标

目标是复用既有 Task Record 查询与单份 Retrospective Application，在一次内部调用中按处置状态或显式 Task 集合返回稳定摘要，并仅在明确请求时包含报告正文。非目标是不新增缓存、评分、自动分析、自动处置、新存储、公共 CLI、Buildr Web 入口或生命周期门禁。

## 核心流程

Agent 通过 internal driver 的 `list` action 请求一个有上限的 Task 集合。Application 先从 Task Record current read model 取得有复盘的 Task，再逐项复用既有 `inspect` 语义；单项失败形成该项诊断，不影响其他合法项返回。默认只返回 pending 摘要，完整 Markdown 必须显式启用。

## 关键边界

- 默认上限 100，硬上限 500，结果按 Task ID 稳定排序。
- 支持处置状态过滤和显式 Task ID 集合。
- 批量读取不写 Task、复盘处置或 follow-up 关系。
- `handle` 与 Task mutation 仍需现有明确授权。
- 不建立跨任务分析、聚类或优先级判断。

## 影响与兼容性

变化仅增加内部 Application/driver result schema 与随包 Skill/contract 指引。既有 `record|inspect|handle`、SQLite current row、单份 Result v1 和 Buildr Web 行为保持不变。

## 验收摘要

聚焦测试覆盖默认 pending、状态与 Task 过滤、上限与截断、正文 opt-in、逐项诊断、非法输入 fail closed，以及调用前后无持久化 mutation。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-retrospectives/spec.md`
- `tasks.md`
