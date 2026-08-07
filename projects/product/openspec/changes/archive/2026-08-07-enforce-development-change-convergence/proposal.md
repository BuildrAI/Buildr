## Why

两个实现已经交付、Task 已进入终态的 OpenSpec Change 仍留在 active 目录，导致 canonical specs 与实现长期冲突。根因是 Task Development 接受调用方声明的 `changeDispositions: converged`，却没有从 Task-scoped Change Resolver 核验对应 Change 在当前任务执行根中确已完成 convergence/archive。

## What Changes

- Task Development 在接收 `converged` disposition 时，必须通过 Task Record 的 Change read model 核验当前 working copy 为 archived。
- `begin`、`planning` 可以继续记录 `pending`；`observe`、Candidate freeze 与 handoff 必须在每个关联 Change 都由产品证明已收敛后才可继续。
- Change 缺失、仍 active、解析不可用或 lifecycle 漂移时返回精确 blocked 诊断，并保持现有 Development Receipt、Candidate 与 handoff 不被伪造为 current。
- 不把 OpenSpec convergence/archive 执行权移入 Task Development，也不让 Task Finish读取或判断 Change lifecycle。
- 这是收紧既有门禁的行为变更，不新增 store、writer、公共 CLI 或 capability。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: `converged` Change disposition 从调用方摘要升级为由 Task-scoped Change read model 证明的 lifecycle 事实，并参与 Content Target、Candidate 与 handoff currentness。

## Impact

- 影响 `task-development` Application、Domain/集成测试、contract 与随包 Skill。
- 复用 Task Record Application 已有 Change Resolver/read model，不新增数据库字段或第二事实源。
- 既有合法流程无迁移；仍 active 或无法解析的关联 Change 将在 Candidate 前更早暴露为 blocked。
