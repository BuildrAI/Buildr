## Context

Task Finish 当前先核对或执行 required assurance，再完成 canonical spec sync、archive、提交和目标分支 rebase。规范允许把严格可归因的 sync/archive 视为 closeout-only，但 rebase 冲突解决、生成资产更新和其他实现变化会使证据失效。

最近一次 Buildr Product 收尾暴露了三个顺序问题：

1. OpenSpec 1.6.0 archive 场景保全检查在 Candidate 之后才发现 delta 重命名风险，迫使 canonical sync 回退并重放。
2. 目标 `dev` 在任务期间前进，最终验证后才 rebase，四个冲突和 runtime sync 改变 delivery tree。
3. 自举 contract test 只支持 active Change 路径，归档后 Candidate 才发现，造成失败后再跑一轮。

三轮 Candidate 分别耗时 97.629、100.410 和 94.181 秒，完整验证自身合计 292.22 秒。优化必须减少可预防的重复执行，但不能以跳过 rebase、archive safety 或最终树验证换取速度。

## Goals / Non-Goals

**Goals:**

- 在最终 required assurance 前完成所有可预见的 implementation/delivery tree 收敛动作。
- 让 Candidate 后只剩可证明、可聚焦检查的 closeout-only transition。
- 在远端竞态或真实内容变化时继续 fail closed，并把重跑原因、次数与时间成本报告出来。
- 在最终 Candidate 前发现 OpenSpec archive 场景保全问题和 active-only 生命周期测试假设。
- 保持 verification、Git integration、OpenSpec、current knowledge 和 worktree providers 的责任分层。

**Non-Goals:**

- 不承诺每次收尾最多执行一次 Candidate。
- 不把普通收尾统一升级为 Candidate；required assurance 仍由 verification provider 决定。
- 不修改外部 OpenSpec 1.6.0 Skill 或 CLI。
- 不让 Task Finish 自行猜测项目测试命令，也不取消最终任务 checkbox 与 archive 的 closeout-only 语义。

## Decisions

### 1. 将 Task Finish 分成 delivery convergence、final assurance 与 closeout-only delivery

收尾采用三个明确阶段：

1. **Delivery convergence**：完成 current knowledge inspect/reconcile、受管资产完整性检查、OpenSpec archive rehearsal、canonical spec sync/post-sync、候选提交、目标分支 fetch/rebase、tree transition doctor/runtime sync，并冻结目标分支 observation。
2. **Final assurance**：对收敛后的 implementation tree 调用 verification provider；普通任务仍可为 affected，高风险或 Product policy 才是 Candidate。
3. **Closeout-only delivery**：只允许最终 verification checkbox、`archive --skip-specs`、归档格式检查、候选提交 amend、目标分支 fast-forward 和 push。每项必须有来源、diff 和 focused evidence。

选择该顺序而不是“验证后再 rebase”，因为 rebase 是最常见且可提前完成的 identity-changing 操作。选择保留 archive 在最终保证之后，是因为 active Change 的最终验证 task 必须先得到真实结果；archive 前通过 rehearsal 和 active/archive contract coverage 消除可预见风险。

### 2. 在隔离副本中执行 OpenSpec archive rehearsal

当 active Change 存在 delta specs 时，Task Finish 在 canonical sync 和最终保证前使用当前 OpenSpec CLI 对隔离 planning copy 执行 archive rehearsal。它只验证上游场景保全、delta merge 与 archive compatibility，不写真实 canonical specs，不替代 Buildr pre/post-sync guard。

如果 rehearsal 失败，修正 delta 后必须重新建立 baseline/pre-sync evidence，再同步真实 canonical specs。这样可在昂贵 Candidate 前暴露场景 rename、遗漏 scenario 或新 spec 合并问题。

没有 delta specs 时跳过并记录理由。临时副本必须有精确 owner 和 cleanup，不得扫描或复制无关 Workspace 内容。

### 3. 候选提交和 rebase 前移，最终保证后禁止再次 rebase

Delivery convergence 允许创建尚未推送的 candidate commit，并按 Git provider policy fetch/rebase 到目标分支最新 observation。rebase 后完成 doctor/runtime sync、必要生成收敛和干净树确认，再冻结 implementation identity。

Final assurance 后再次 fetch 只做 race detection：

- 目标 ref 未变化时，允许 fast-forward 集成和 push。
- 目标 ref 已变化时，不在已验证树上继续 rebase；返回 convergence 阶段，rebase 后重新请求相同 required assurance。

候选提交不是额外远端分支，也不改变默认“不推送任务分支”。最终 checkbox/archive 产生 closeout-only delta 时可以 amend 本地候选提交，但必须证明 implementation tree 部分未变化。

### 4. archive-sensitive 覆盖由 workflow rehearsal 与 Project verification 共同承担

OpenSpec rehearsal 负责规范合并和 archive mechanics；Project verification 负责代码、测试和路径假设。Buildr Product 中任何读取自举 Change 的测试必须解析 active 或唯一 archived identity，Change read model 必须继续覆盖两种 lifecycle。

Task Finish 只把任务涉及 lifecycle-sensitive paths 的信号交给 verification provider，不硬编码测试命令。Project policy 没有相应能力时，结果必须披露 coverage gap，不能把 rehearsal 说成应用层 archive 验证。

### 5. 把重复验证变成结构化失效链

Task Finish 为每次旧 evidence 失效记录：source candidate、触发动作、`implementation-changed|target-race|verification-failed` 原因、新 candidate、run reference 和 wall-clock。最终报告汇总 verification execute count、Candidate executor count、失效次数和重复验证总耗时。

Verification provider 每次仍只对单一 candidate 返回权威 evidence；Task Finish 负责组合本次 closeout 的 run chain，不把多个并行 duration 相加推算单轮 wall-clock。

## Risks / Trade-offs

- [候选 commit 早于 archive，流程比当前多一次 amend] → 将 amend 严格限制为可证明的 closeout-only delta，并比较 implementation/delivery tree。
- [archive rehearsal 复制 planning root 会增加 I/O 和清理责任] → 只复制当前 Project OpenSpec root到精确临时目录，记录 owner 并在结果消费后清理。
- [目标分支在 Candidate 后仍可能变化] → 不能消除该竞态；检测后返回 convergence 并明确重跑，而不是 force push 或复用失效 evidence。
- [把所有生命周期测试都机械跑一遍会扩大验证] → 由 Project verification policy 按 affected paths 选择，Task Finish 只提供信号与 rehearsal evidence。
- [现有 closeout-only 分类可能被扩大滥用] → 保留来源动作、精确 diff、focused checks 和 fail-closed 条件；无法证明时一律按 implementation-changed。

## Migration Plan

1. 先更新 canonical requirements、Task Finish provider 和相关 contributions。
2. 为 delivery convergence、archive rehearsal、目标 ref race 与失效链增加 contract/integration tests。
3. 更新 Buildr Product 的 active/archive 自举测试和核心流程知识。
4. 用真实 task worktree 验证普通 affected 收尾与 Product Candidate 收尾。
5. 若新顺序产生不可恢复问题，回退 provider sequencing；capability identities 和外部 OpenSpec Skills 保持不变。

## Open Questions

无阻塞问题。archive rehearsal 的内部 helper 位置和临时目录结构可在实现时按现有模块边界确定，不构成产品语义决策。
