# 任务看板确定性 Workspace 绑定

## 一句话摘要

task-board 在 task environment 中直接消费 `worktree context.workspaceRoot`，不再让 Agent解析 receipt 或选择 Workspace identity。

## 背景与问题

产品已经能够确定性解析 environment 与 canonical Workspace，但上一版 task-board 指导重复暴露了 receipt/identity 分支，增加推理成本并可能产生不同实现。

## 目标与非目标

- 固定 environment-bound context 为唯一定位入口。
- context 无效时 fail closed。
- 不改变普通 Workspace discovery 或 `worktree context` schema。

## 核心流程

task environment → environment-bound `worktree context` → `workspaceRoot` → retained Project task-board path。

## 关键变化

- Skill 和 contract 只允许一个命令和一个输出字段。
- 规范禁止 receipt 解析、路径扫描和显式 identity fallback。
- contract test 固化正向与负向要求。

## 影响、风险与兼容性

现有看板与 context JSON 保持兼容；stale/blocked environment 会阻止看板写入，避免写错 Workspace。

## 验收摘要

OpenSpec convergence、task-board contract、affected verification 和 retained doctor 通过。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-board/spec.md`
- `specs/task-board-maintenance/spec.md`
- `tasks.md`
