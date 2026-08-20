## Why

现有 `buildr.parent-plan/v1` 只能用一段 `summary` 表达完整实施方向，并让 `plannedChildTaskId` 同时承担预计实施单元和真实 Child binding 两种语义，导致计划可读性不足、eligible 计算可能被预测字段误导，Buildr Web 也无法把 Parent 的完整计划置于核心位置。现在需要在不迁移历史 SQLite 数据、不修改 live `redesign-release-workflow` Parent 的前提下，建立结构化、可兼容且可验证的新模型。

## What Changes

- 引入 `buildr.parent-plan/v2`，结构化保存优先级、标题、目标、实施方向、禁止边界、预计 Child 与依赖；新 writer 只写 v2，v1 保持 dual-read。
- 让 v1 `plannedChildTaskId` 仅作为兼容读取的预计信息，不再建立 disposition、eligibility 或实际 Child binding；真实 binding 只由 Task Parent 关系、Child Development Contribution binding 与可证明 handoff 派生。
- 通过三个正交 read-model 轴稳定表达预计信息、可启动性与真实绑定/交付处置，并让依赖阻塞返回可读 work item 标题。
- 保留现有 `record` / `reconcile` Application writer 边界；以显式 v1→v2 `reconcile` 完成升级，不新增 SQLite table、migration、backfill 或 UI writer。
- 扩展 Parent Plan identity 覆盖全部 v2 结构化内容；更新后旧 Planning Review 自动 stale，current 新 Review 被 Development 消费后才恢复 eligible/startup。
- 重组 Buildr Web Task 概览：Parent 默认突出 outcome、eligible work item、完整方向、关键决策与最终验收；Child 只紧凑展示 Parent 来源与实际承接方向；普通 Task 不显示空 Parent 主体；技术事实默认折叠。
- 更新 CLI schema/example、Application JSON、产品文档、current knowledge、随包 Agent workflow 指引与 Domain/Application/CLI/Web/Browser 测试。
- 不发布 npm/tag/GitHub Release，不迁移或修改 live `redesign-release-workflow` Parent。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `parent-child-task-coordination`: Parent Plan v2、v1 dual-read、expected Child 与 actual binding 分离、三轴状态投影和显式升级语义。
- `task-development`: Development Receipt 中 Parent Plan 的兼容读取、新写入与 identity/currentness 边界。
- `task-review-results`: Planning Review 对完整 v2 Plan identity 的适用性判断。
- `task-entry-snapshot`: Parent startup 与 eligible projection 不受预测字段影响。
- `cli-product-surface`: Parent Plan schema/example、record/reconcile/inspect JSON 的稳定兼容形状。
- `local-app-web-client`: Parent、Child 与普通 Task 的差异化概览和默认折叠技术事实。
- `agent-task-workflows`: Agent 创建、升级、绑定和解释 v2 Parent Plan 的正确流程。
- `buildr-package-assets`: 随包 Task workflow 指引和 Web 构建产物同步交付。

## Impact

- Domain/Application：`parent-coordination`、`task-development`、`task-entry` 与公开 JSON schema。
- CLI/HTTP：`task parent record|reconcile|inspect`、Parent coordination API/read model。
- Web：Task detail 数据类型、Parent/Child/普通 Task 布局、样式、browser smoke 与正式 `web-dist`。
- OpenSpec/current knowledge：相关 canonical specs、Parent/Child 架构文档、Buildr 与 Buildr Web Service/technical knowledge。
- 数据：复用 `task_development_current.record_json` 整值 authority；无 SQLite schema migration、无历史 backfill。
