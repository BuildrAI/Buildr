# Task Retrospective 第一版

一句话摘要：Buildr 为 terminal Task 提供一份直接存入 Workspace SQLite 的 Agent 执行效率复盘，并在 Local App Task 详情中只读展示，同时完整退役过程型 `task-asset-review` 当前能力。

## 背景与问题

Buildr 的 workflow 与 harness 会为 Agent 增加额外步骤。如果任务推进依赖大量自行推理、试错和过程 observation，会放大执行时间与 token 消耗。当前最需要的是一个低成本反馈入口，用真实任务结果识别高成本步骤和人机协作、workflow、harness 的优化机会。

## 目标与非目标

目标是保存并展示单一当前执行效率复盘；报告由 Agent 基于当前可见证据自由组织。非目标包括自动 telemetry、隐藏推理/完整轨迹采集、结构化评分、历史版本、跨任务聚合、资产候选写回和任何 lifecycle gate。

## 受影响角色

- Workspace 用户：在 Local App Task 详情查看复盘，决定是否另行发起优化任务。
- Agent：在用户明确要求时复盘 terminal Task，并通过唯一 Application 写入报告。
- Buildr：只负责 Result 校验、SQLite current 存储、只读投影和 capability/runtime 交付。

## 核心流程

1. 用户对 terminal Task 明确要求复盘。
2. Agent 检查当前可见步骤、耗时/token 证据、重复尝试与协作成本，生成自由 Markdown。
3. `task-retrospective` 通过内部 driver 调用 Application；Application 校验 Task 状态并原子替换 SQLite current row。
4. Local App “复盘”Tab 只读展示报告；没有记录时显示“尚未复盘”。

## 关键变化

- 新增 `buildr.task-retrospective/v1` 与唯一 SQLite current Result。
- 新增 Local App 只读复盘 Tab。
- 删除 `task-asset-review` active capability、观察流程、人工决定和 Development finalize gate。
- 旧 `.buildr/asset-review/` 数据保持 inert，不读取、不迁移、不删除。

## 影响、风险与兼容性

这是 active capability breaking retirement，但不会改变已有 Task Record 或读取旧 observation。自由 Markdown 暂不支持跨任务自动统计；数据不足时报告必须明确缺口。

## 验收摘要

- terminal Task 可记录/替换并读取一份复盘，active Task 写入被拒绝且不覆盖旧值。
- Local App 可展示报告和空态，不含写操作。
- Development/Finish/terminal/cleanup 在没有复盘时不受影响。
- 新 package/runtime 不再包含旧 capability，旧 observation 字节保持不变。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-retrospectives/spec.md`
- `tasks.md`
