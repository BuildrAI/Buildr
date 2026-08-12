## Why

当前 Task Finish 会在 OpenSpec sync/archive、目标分支 rebase 和 runtime 投影完全收敛前消费或执行最终验证；一旦后续动作改变 delivery tree，Candidate 必须失效并重跑。最近一次真实收尾因此执行了三轮 Candidate（合计 292.22 秒），并在归档后才发现 active-only 测试假设，约十五分钟的收尾中近五分钟直接消耗在完整 Candidate。

现在需要把“最终验证”从流程中的普通前置门禁提升为收尾树冻结后的单一保证点，同时保留远端竞态、冲突修复和真实实现变化必须重跑的安全边界。

## What Changes

- 为 Task Finish 增加 delivery convergence 阶段：在最终 required assurance 前完成 current knowledge inspect、OpenSpec sync 兼容预演与 canonical sync、生成资产检查、目标分支 fetch/rebase 和必要 runtime 对齐。
- 明确最终验证后只允许已证明的 closeout-only transition；OpenSpec archive、最终任务 checkbox、目标分支 fast-forward 和 push 必须分别满足可归因、focused checks 与 tree-equivalence 条件。
- 当 rebase 冲突解决、远端目标竞态、归档敏感检查失败或其他实现内容变化导致重跑时，统一记录失效原因、执行次数和额外耗时，不把安全重跑隐藏成普通验证。
- 增加 OpenSpec archive-sensitive 覆盖要求，使依赖 Change 路径或生命周期的测试同时覆盖 active 与 archived 状态，并在最终 Candidate 前暴露只支持 active 路径的假设。
- 更新核心流程知识，解释“准备 delivery tree → 最终保证 → closeout-only 交付”的新顺序。
- 不承诺 Candidate 永远只执行一次；发生无法预先消除的目标分支竞态或真实实现变化时仍然 fail closed 并重跑。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 调整 Task Finish 的 delivery convergence、最终验证、OpenSpec archive、Git integration 和重跑报告顺序。
- `task-verification`: 增加最终保证点、archive-sensitive readiness evidence、验证失效原因及重复执行成本的结果要求。

## Impact

- 受影响资产：`task-finish` Skill、OpenSpec/Task Finish contributions、相关 capability contract 或 provider result evidence、Product verification registry/fixtures 与核心流程知识。
- 受影响测试：Task Finish sequencing、OpenSpec sync/archive lifecycle、active/archive Change 路径、Git rebase/race、Candidate identity 与 timing evidence。
- 不修改外部 OpenSpec 1.6.0 Skills 或 CLI；通过 Buildr-owned workflow、contributions 和既有 capability seams 实现。
