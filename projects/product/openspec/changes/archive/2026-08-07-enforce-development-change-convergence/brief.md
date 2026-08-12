# Task Development Change 收敛守卫

## 一句话摘要

Task Development 不再信任调用方把关联 Change 声明为 `converged`，而是要求当前 Task working copy 已由 OpenSpec 专业流程完成归档。

## 背景与问题

已有 Task 可以在 Change 仍 active 时提交 `converged`，继续形成 Candidate 与 Finish handoff。这样即使实现已经交付，canonical specs 仍可能长期落后。

## 目标与非目标

目标是让 `converged` 绑定当前 working copy 的 archived lifecycle，并让后续漂移使 Candidate/handoff 失效。非目标是不新增 store、writer、Receipt 字段、公共 CLI 或 Finish 门禁，也不让 Development 执行 convergence。

## 受影响用户与角色

- Agent：在 Planning 阶段使用 `pending`，只在专业收敛完成后提交 `converged`。
- Task Development：核验并重验 lifecycle 事实，维护 currentness。
- Task Finish：继续只消费 current handoff，不解释 Change lifecycle。

## 核心流程

- 继续允许规划阶段使用 `pending`，code-only Task 继续提交空列表。
- `converged` 必须由 Task Record 的 Task-scoped Change read model 证明：当前 working copy 可用且 lifecycle 为 `archived`。
- Task Environment 已归档而 retained checkout 仍 active 时，以 working copy 为准。
- inspect、freeze、decision 与 handoff 重验该事实；active、missing、unavailable 或后续漂移会让 Task Context、Candidate 与 handoff stale 或 blocked。
- convergence/archive 仍由 OpenSpec 专业流程执行；Task Development 与 Task Finish 都不取得该执行权。

## 关键变化

- `converged` 从调用方摘要收紧为 Task-scoped working copy lifecycle 事实。
- inspect 保留既有 lifecycle snapshot 读取优化，但额外重验 Change convergence。
- mutation 与 currentness 路径共享稳定的 `task_development_change_not_converged` 诊断。

## 影响、风险与兼容性

合法的 archived working copy 路径保持兼容；仍 active 或 resolver 暂时不可用的旧调用会 fail closed。历史 Receipt 不迁移、不改写，只在 currentness 观察时派生 stale 或 blocked。

## 验收摘要

- archived working copy + active retained baseline 可继续研发流程。
- active 或 resolver unavailable 不能伪报 `converged`。
- 已形成 Candidate 后 lifecycle 漂移可被 inspect 与 mutation 路径识别。
- 不新增 store、writer、Receipt 字段、公共 CLI 或 Finish 门禁。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/task-development/spec.md)
- [Tasks](tasks.md)
