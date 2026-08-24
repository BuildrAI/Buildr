## Context

Task Finish 在 Workspace SQLite 中只保留一个 `task_finish_current` authority。普通 `run` 为避免丢失恢复现场，只允许无副作用旧 run 被新 Handoff supersede；一旦 prepare 已形成隔离 carrier，identity 变化就必须失败关闭。这个边界本身正确。

但显式 `reconcile` 的目标不同：它从真实远端重新证明 Delivery。当前实现先要求 current run identity 与 current Handoff 完全相等，导致一个 terminal failed、从未 delivery 的旧 run 永久挡住已经由外部 Git 路径交付的 current Handoff。即使旧 carrier 是 Buildr 可证明 ownership 的 transient worktree，也没有合法路径清理并替换 terminal association。

约束包括：Development Handoff 只能取 current；远端包含证明必须逐 repository 成立；旧 run/Execution Record 不能被静默改写；carrier cleanup 只能删除精确 run-owned worktree；普通 `run` 的 supersede 规则不得放宽。

## Goals / Non-Goals

**Goals:**

- 为显式 `task finish reconcile` 增加一条可证明、可重试、fail-closed 的 stale failed run 恢复路径。
- 只有当前 Handoff 的全部 repository contribution 已被真实远端包含后，才清理旧 run-owned carrier 并登记 terminal Delivery。
- 在任何身份、副作用、远端包含或 ownership 证明缺失时保留旧 current run。
- 让部分 carrier cleanup 结果可见且幂等重试安全。

**Non-Goals:**

- 不允许普通 `task finish run` 自动换绑已有 carrier 的 run。
- 不复用旧 carrier 作为当前 Handoff 的 Delivery 证明，不修改 Candidate、Verification、Review 或 Development Handoff。
- 不允许有 lease、delivery、retained、prepared completion、cleanup 或后续 phase 事实的旧 run 进入该恢复路径。
- 不为未被远端包含的贡献执行 push、merge、rebase 或 Delivery Adaptation。

## Decisions

### 1. 恢复入口只放在显式 reconciliation

`run` 继续在看到旧 carrier 时返回 `task_finish.current_run_identity_conflict`。`reconcile` 本身已经表达“从真实远端登记外部交付”的显式意图，因此它可以在更强证明条件下处理旧 occupancy。

备选方案是放宽全局 `replaceableStaleRun`，但这会让普通新 run 在未证明 Delivery 时删除恢复现场，违反现有安全边界，因此不采用。

### 2. 先证明当前 Handoff，再触碰旧 carrier

identity 不匹配时，Application 为 current Handoff 创建内存中的临时 reconciliation run，并逐 repository 使用 current Task Contribution 执行真实远端 readback/containment。任一 repository `unproven` 时不写 current row，也不清理旧 carrier。

旧 run 只提供 occupancy cleanup 输入，不参与当前 Handoff 的 delivery identity、carrier identity 或 containment。这样避免把旧 Candidate 的人工 adaptation 误当作新 Candidate 的证明。

### 3. 使用封闭的旧 run eligibility

允许恢复的旧 run 必须同时满足：Task 与 repository set identity 相同；差异只出现在 Handoff/Candidate/generation/Content Target；总体状态为 terminal `failed`；preflight 已通过、prepare 已失败、verify/deliver/cleanup 从未开始；没有 resume token、lease、delivery、retained、completion、prepared completion、cleanup 或已释放 occupancy 事实。

不根据特定 failure code 放行，因为恢复安全来自 phase 与副作用事实，而不是错误字符串。任何无法识别的 phase 状态都拒绝。

### 4. cleanup 使用既有 run-owned carrier primitive

远端证明完整后，reconciliation 调用与 occupancy release 相同的精确 carrier cleanup：从旧 run 的 repository plan 解析预期 root，并要求 Git worktree registration 与 root identity 匹配。多个 repository 的 cleanup 可产生部分 effect；若其中一个失败，旧 current row 保持不变，返回已发生的 cleanup effects，后续重试把已删除且已不存在的 carrier 视为 `not-applicable`。

不直接递归删除目录，也不要求先 abandon Task。

### 5. terminal persistence 只保存 current Handoff

全部 containment 与 cleanup 均成功后，才以 current Handoff 的新 reconciliation run 原位形成 terminal Finish completion。结果增加 bounded `recovery` 摘要，记录 superseded run id、旧冻结 Handoff 和 carrier cleanup 状态；旧 run 的既有 Execution Record 保持原失败结论，不被改写或伪装为成功。

## Risks / Trade-offs

- [多个 carrier cleanup 不是原子操作] → 先完成全部远端证明；返回逐 repository effects，并使已删除项在重试时幂等为 `not-applicable`，不提前覆盖 current row。
- [过宽 eligibility 可能丢失未知副作用] → 使用 closed phase/fact 检查，未知字段或后续 phase 非 untouched 一律冲突。
- [远端在证明后再次变化] → 复用现有 fetch/readback race 检查；terminal 只绑定该次 observed final ref，后续变化不倒推 Delivery 未发生。
- [旧 Execution Record 与新 terminal run id 不同] → 这是有意的 provenance：旧记录说明失败，新 terminal association说明当前 Handoff 的外部交付对账；recovery 摘要把两者关联。

## Migration Plan

无需数据迁移。现有未冲突 reconciliation 和普通 Finish run 行为保持兼容。部署后对仍满足 closed eligibility 的旧失败 run 重新执行同一个 `task finish reconcile --task <id>` 即可恢复；不满足条件的历史状态继续返回原 identity conflict。

回滚只需撤销实现和 delta spec；尚未恢复的旧 current rows 不会被迁移或改写。

## Open Questions

无。
