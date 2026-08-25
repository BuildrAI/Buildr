## Why

当前发布流程在 Publication 成功后要求把 `main` 以双亲 merge commit 合并回 `dev`，这既与 `dev` 的线性历史策略冲突，也重复引入了已经从 `dev` 选择到 release 的内容。现在需要把收尾门禁改为验证发布集合的 `dev` 来源与必要回流证据，使 `dev` 继续作为唯一研发来源而无需依赖 `main → dev` 路径。

## What Changes

- 将发布后 Git 收尾从创建并推送 `main → dev` merge commit，改为只读核验 current release selection 的来源、冻结身份、Publication 身份和 current `dev` 包含关系。
- 要求 baseline 与每个 selected `sourceDevCommit` 均可由 current `dev` 证明；没有 `sourceDevCommit` 的 release-only 内容必须在收尾前具有独立、可验证的 `dev` 回流证据，否则失败关闭。
- 允许 `dev` 在 release 冻结后继续前进，不要求 published `main` 成为 `dev` 祖先，也不要求 `dev` 与 release/main tree 相等。
- 保留 `release → main` 的受保护发布路径、`dev` 线性历史策略、正式远端 release ref 和现有 Publication 事实。
- 更新 release lifecycle、closeout、Buildr Release Skill、current knowledge 与回归测试，使候选问题固定从 support Task 的 `dev` 分支修复并以 `cherry-pick -x` 进入既有 release 集合。
- **BREAKING**：发布后 `converge-dev` 不再拥有创建 merge commit 或写入 `dev` 的语义；旧的 `main → dev` 成功/阻塞判断被 provenance reconciliation 结果替代。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `open-source-release-governance`: 将 Publication 后的 `main → dev` Git 收敛契约改为 release 来源与回流证据核验，并据此调整 closeout 门禁。
- `release-collection-model`: 将发布身份链和发布后维护边界改为以 current `dev` provenance reconciliation 为权威，不再要求 published `main` 进入 `dev` 历史。
- `agent-task-workflows`: 调整 Release Skill、协调 Task 和 Git owner 的阶段语义，使 support 修复先交付 `dev`、再选择进入 release，并以只读 reconciliation 完成发布收尾。

## Impact

- 影响 `projects/product/services/buildr/tools/release` 中 Git convergence、lifecycle 和 closeout owner，以及对应 CLI 输出 schema、错误码和测试。
- 影响 Buildr Release Skill 的源资产、生成投影、静态校验与当前知识文档。
- 不改变 release selection 的 `cherry-pick -x` 模型、受保护 `release → main` PR、tag/npm/GitHub Release 发布事务或 `dev` 分支保护策略。
