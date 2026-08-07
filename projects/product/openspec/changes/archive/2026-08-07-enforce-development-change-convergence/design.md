## Context

Task Development 当前把调用方提交的每个 `changeDispositions` 直接归一化进 `taskContext.identity`。虽然 `pending` 会阻止 Candidate freeze，但调用方可以在 Change 仍 active 时提交 `converged`，Application 不会读取 Task Record 已有的 Task-scoped Change read model核验。两个近期正式 Task 因此在实现与 Finish 已完成后仍留下 active Change，canonical specs 长期落后于实现。

Task Record `inspect` 已经通过 Task-scoped Change Resolver 返回每个引用的 `availability`、当前 working copy provenance、Change lifecycle 和 retained baseline。该 read model 是现有 Application authority，足以封闭此缺口。

## Goals / Non-Goals

**Goals:**

- 让 `converged` 成为产品观察到的 Change lifecycle 事实，而不是调用方声明。
- 让 Change 在形成 Content Target 后重新变为 active、缺失或不可解析时，使 Candidate/handoff 派生为 stale。
- 保持 pending planning 与多 Change Task；code-only Task 继续使用空数组。
- 用稳定诊断指向 `openspec converge`，而不是让 Agent猜测恢复动作。

**Non-Goals:**

- Task Development 不执行 convergence、sync 或 archive。
- Task Finish 不读取 OpenSpec Change，不新增交付门禁。
- 不新增 Store、Receipt字段、公共 Development CLI、锁或通用 lifecycle framework。
- 不迁移或重写已有 terminal Task 的历史记录。

## Decisions

### 1. 复用 Task Record inspect 的 Change read model

Application 在构造 current Task context 时，针对每个请求为 `converged` 的引用匹配 `inspectTaskRecord` 返回的同一 `project/change` entry，并要求：

- `availability` 为 `available`；
- 当前 working copy 存在；
- working copy lifecycle 为 `archived`。

选择 working copy 而不是 retained baseline，是因为正式 Task 可以在隔离 Environment 中先完成 convergence/archive；retained checkout 在 Finish 前仍应保持旧 active 状态。

替代方案是读取文件系统路径或直接调用 OpenSpec CLI。前者会复制 Change Resolver 规则，后者会让 Development取得专业执行权，均不采用。

### 2. 所有 currentness 观察都重验 convergence

校验放在 `taskContext` 构造边界，而不是只放在 `observe`。这样 `begin/planning/observe` mutation 和后续 `inspect/freeze/decide/handoff` 的 `observeCurrent` 都消费同一事实。Change 后续漂移会让旧 Task context 不再 current，Candidate 与 handoff自然失效。

`pending` 不要求已归档，因此 proposal/design 阶段不受阻；只有调用方声称 `converged` 时才要求产品证明。

### 3. 保持 Receipt schema，增加稳定 blocked 诊断

Receipt 继续保存原有 `pending|converged|not-applicable` disposition，不增加 lifecycle、path 或 resolver payload。无法证明时 Application 返回 `task_development_change_not_converged`，details 包含 portable `project/change`、availability 与观察到的 lifecycle，并提供唯一 next action：先完成该 Change 的 deterministic convergence/archive。

## Risks / Trade-offs

- [旧调用方在 active Change 上错误提交 `converged` 将开始失败] → 这是预期的 fail-closed 修复；`pending` 路径保持兼容。
- [retained checkout 与 Task Environment lifecycle 不同] → 明确优先使用 Task-scoped working copy，测试覆盖 candidate archived、retained active。
- [历史 Receipt 已保存错误 `converged`] → 每次 currentness 观察重验，不迁移或改写历史值；旧 Candidate/handoff只会派生为 stale。
- [Change Resolver 暂时不可用] → 保持 blocked，不回退到路径扫描或调用方摘要。
