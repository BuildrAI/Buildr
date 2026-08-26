## Why

当前 `dev → release → main` 发布模型要求 release 与 main 最终只按 tree identity 对账，并把 squash 作为可接受的合入方式；当 main 已经包含 dev 的 squash 历史、但不再是 release 的祖先时，release→main PR 会产生真实内容冲突，无法可靠完成 rc.24。现在需要把一次性 main reconciliation 建模为受证据约束的发布步骤，使 dev 继续保持线性，同时允许 release 通过 merge commit 收敛到受保护的 main。

## What Changes

- 新增一次性 main reconciliation 能力：记录当前 main、冻结的 release 选择集合、冲突解决后的 release commit/tree 及前后关系。
- release→main 候选 PR 固定使用 merge commit；不得用 squash/rebase 替代该发布合入。
- reconciliation 发生内容变化时，使旧 Candidate、artifact、readiness 和 PR 证据失效，并从新的 release HEAD 重新生成。
- 保留 `dev` 的线性开发约束、release 的 `cherry-pick -x` 来源链、main 的 force-push/删除保护。
- **BREAKING**：发布收敛不再把“main tree 相等”作为唯一充分证据，必须证明 merge-commit 方式和 reconciliation provenance。

## Capabilities

### New Capabilities

- `release-main-reconciliation`: 定义 release 与当前 main 发生一次性 reconciliation、证据绑定、重建候选及 merge-commit 收敛的行为。

### Modified Capabilities

- `agent-task-workflows`: 将 release→main 的发布收敛从 squash-compatible 改为支持并要求 merge-commit reconciliation。
- `open-source-release-governance`: 增加 merge-commit 合入策略、最终 release identity 与 main 对账证据要求。
- `release-collection-model`: 允许在不改变 dev 选择来源的前提下追加受控的 main reconciliation provenance。

## Impact

- 影响 `services/buildr` 的 release collection、readiness、Git convergence、Candidate/artifact 绑定及相关 CLI/HTTP 结果。
- 影响 release Skill、产品 OpenSpec specs/knowledge 和 release system tests。
- rc.24 当前 PR #47 需要按新模型解决冲突并重跑 Candidate；不执行 tag、npm 或 GitHub Release publication。
