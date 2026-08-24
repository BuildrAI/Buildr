# 完善 Parent Task 计划与协调体验

## 一句话摘要

以结构化 Parent Plan v2 分离预计 Child 与真实 Child binding，并让 Buildr Web 把完整 Parent 计划作为协调入口。

## 背景与问题

Parent Plan v1 只能用 `summary` 表达实施方向，`plannedChildTaskId` 又同时承担预计实施单元和真实 binding 语义，导致 eligibility 可能被预测字段误导。Task Overview 默认突出 Task Record、专业摘要和技术事实，用户无法直接看到完整 outcome、方向、决策、依赖、边界和最终验收；普通 Task 还会出现无意义的 Parent 空模块。

## 目标与非目标

目标是引入结构化 v2、保持 v1 dual-read、通过显式 reconcile 升级、稳定输出预计/可启动/真实处置三个轴，并为 Parent、Child、普通 Task 提供不同的信息层级。非目标包括自动创建 Child、增加 SQLite migration/progress store、迁移 live `redesign-release-workflow` Parent、复制 Child 专业事实或执行正式发布。

## 受影响用户或角色

- 通过 Agent 设计和推进 Parent/Child 计划的人；
- 通过 Buildr Web 查看 Parent 完整方向、Child 来源或普通 Task 进度的人；
- 使用 CLI/Application 创建、升级、审查和绑定 Parent Plan 的 Agent workflow。

## 核心流程

新 Parent 通过 v2 record 保存完整计划，Planning Review 绑定全部结构化内容 identity；expected Child 仅解释未来实施单元。真实 Child 启动后，只有 Parent relationship 与 Child Development Contribution binding 共同形成 actual binding，matching handoff 才证明 delivery。已有 v1 Parent 继续读取；需要采用 v2 时显式 inspect current identity、提交完整 v2 reconcile、重新 Planning Review 并 refresh planning。

## 关键变化

- Parent Plan v2 结构化 outcome、architecture decisions、priority/title/objective/directions/boundaries/expected Child/dependencies 和 final acceptance。
- v1 `plannedChildTaskId` 只做 legacy expected projection，不影响 disposition 或 eligibility。
- Parent Coordination read model 分别输出 expectation、eligibility、actual binding/delivery。
- Buildr Web Parent 主体默认展示完整计划，Child 只展示紧凑来源，普通 Task 不显示 Parent 专属模块，技术事实默认折叠。

## 影响、风险与兼容性

复用现有 Development JSON authority，不新增 SQLite migration。v1 summary 的 rich compatibility projection 信息有限，因此必须清晰标记 legacy，并由显式 v2 reconcile 完成真实升级。Web 重组保留既有路由、API client 与稳定 browser hooks，正式 `web-dist` 必须和源码构建一致。

## 验收摘要

Domain/Application/CLI/Web 测试需证明 v2 round-trip、v1 读取与显式升级、预计字段不影响 eligible、真实 Child 才形成 binding、Plan identity 使 Review stale/current 正确切换、全部真实 disposition、Parent/Child/普通 UI 差异化与技术事实默认折叠。等价 fixture 应完整表达 7 个方向、15 条决策和 14 条验收，且 live `redesign-release-workflow` 不发生变化。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`

