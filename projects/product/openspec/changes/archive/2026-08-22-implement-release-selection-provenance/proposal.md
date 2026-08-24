## Why

P0 已定义人工选择的 `release-<version>` 契约，但 `tools/release` 还没有能执行该契约的 checkout-only owner。继续沿用隐式最新 `dev` 会让 release HEAD、选择顺序和冲突现场无法审计，也会给后续 Candidate 与 readiness consumer 一个不可靠的 source。

## What Changes

- 新增 `release-selection.mjs`，实现 release branch 的创建、逐 commit `cherry-pick -x`、inspect、freeze、abandon 与本地 cleanup。
- 以 Git refs 保存 baseline、freeze、abandon 状态，以 release commit 的 `cherry-pick -x` trailer 重建 ordered selection chain；不新增 SQLite 或旁路事实 store。
- 所有动作返回 closed JSON read model，包含 baseline、source/result commit、changed paths、generation、freeze/abandon 状态和冲突事实；失败返回 `effects: []` 与精确恢复动作。
- 补充 release collection delta spec 和 focused integration tests。

## Non-Goals

- 不实现 Product Candidate、唯一 tarball、Task evidence correlation、readiness、publish transaction 或 main/dev convergence。
- 不执行远端 push、远端 branch 删除、tag、npm 或 GitHub Release mutation。

## Capabilities

### New Capabilities

- `release-collection-selection`: checkout-only release branch selection、provenance read model 与生命周期状态。

### Modified Capabilities

- `open-source-release-governance`: 让后续 release consumer 能读取 current selection chain，而不改变 Candidate、publish 或 main/dev owner。

## Impact

- `projects/product/services/buildr/tools/release/release-selection.mjs`
- `projects/product/services/buildr/test/integration-candidate-release/release-selection.test.mjs`
- `projects/product/openspec/specs/release-collection-selection/`（由本 Change 收敛）
- 其他 release owner 仅消费本 Change 导出的 read model，不修改其 persistence。
