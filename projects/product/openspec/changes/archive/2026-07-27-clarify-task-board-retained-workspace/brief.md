# 任务看板 retained Workspace 所有权

## 一句话摘要

任务看板始终由 retained Workspace checkout 中的 Project 唯一持有，关联 Change 的 task environment 只提供事实来源。

## 背景与问题

一个完整任务可以跨多个 Change、交付批次和 task environments。当前 Skill 的“Project 所在环境”措辞可能让 Agent 把任务看板写进某个临时 environment，使看板随环境清理而消失或形成多个副本。

## 目标与非目标

- 明确 retained Workspace 是任务看板唯一写入 authority。
- 保持现有稳定 Project knowledge 路径和单向维护模型。
- 不迁移既有 HTML，不改变 Change、代码或验证 evidence 的环境边界。

## 核心流程

Agent 从显式 Workspace identity 或 task environment receipt 解析 retained Workspace，在其中定位唯一 Project task 看板；关联 environments 只用于核实 OpenSpec、代码、提交和验证事实。

## 关键变化

- Skill 和 capability contract 显式禁止 environment-local 看板写入。
- canonical specs 和产品说明记录跨 Change 的稳定所有权。
- contract test 固化 source/package runtime 中的边界文案。

## 影响、风险与兼容性

现有看板路径和内容保持兼容。并行任务更新 retained checkout 时仍由既有 identity、候选验证与冲突即 blocked 规则保护，不自动覆盖或合并。

## 验收摘要

OpenSpec strict validation、task-board contract test、source/package 投射一致性和 Buildr doctor 均通过。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-board/spec.md`
- `specs/task-board-maintenance/spec.md`
- `tasks.md`
