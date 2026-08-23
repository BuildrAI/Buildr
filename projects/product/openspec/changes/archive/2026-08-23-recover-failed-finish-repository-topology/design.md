## Context

现有恢复 eligibility 要求旧 run 与当前 Handoff 的 `repositorySetIdentity` 相等。但该 identity 对完整 repository plan 求哈希，包含 `taskContribution`；Handoff generation 更新正是恢复场景的前提，因此 contribution 改变会制造假 topology 冲突。

## Goals / Non-Goals

**Goals:**

- 用不含 Task Contribution 的结构比较证明旧 run 与当前 Handoff 指向同一 repository topology。
- 允许同 topology 下 `repositorySetIdentity` 随新 Handoff 更新。
- 对 roots、branch、remote、selector 或 disposition 的真实变化继续 fail closed。

**Non-Goals:**

- 不放宽旧 run phase、副作用、carrier ownership 或远端包含条件。
- 不改变普通 `task finish run` 的 current-run identity conflict。
- 不引入 caller proof、人工 override 或旧 run 原地改写。

## Decisions

1. 在 reconciliation 内构造排序后的 topology projection，比较 `selector`、`sourcePath`、`retainedRoot`、`taskRoot`、`environmentBranch`、`targetBranch`、`remote`、`disposition` 与 `reason`。选择结构比较而非新增持久化 identity，避免迁移旧 run，同时确保所有真实 Git/ownership 边界被覆盖。
2. `repositorySetIdentity` 仍保留在 mismatch 报告与新 terminal identity 中，但 recovery eligibility 允许它与 Candidate/Handoff identities 一起变化；唯一授权条件是 topology projection 精确相等。
3. 测试必须显式改变 Task Contribution，使 repository-set identity 变化，同时保持 topology 相等；另以 target branch 或 repository root 变化证明拒绝路径。

## Risks / Trade-offs

- [遗漏 topology 字段会误判相同] → projection 覆盖 normalize plan 中除 Task Contribution 和派生 identity 外的全部边界字段，并用负向测试锁定。
- [旧 run reason 文案漂移造成保守拒绝] → 对 `not-applicable` reason 也精确比较，宁可拒绝而不猜测语义等价。
- [新 Handoff 贡献未交付] → eligibility 通过后仍必须先完成当前 Task Contribution 的真实远端包含证明，零证明不清理旧 carrier。
