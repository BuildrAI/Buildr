## Why

当前发布流程在完整 Candidate 通过后才把 `main` merge 回 release。由于发布后只核验 dev 来源、不让 main/dev 建立祖先关系，下一版本会重复把 main 的历史内容带入已冻结 release，既造成版本材料冲突，也可能重新引入已被 dev 替代的旧实现；同时 release owner 未强制 matching Task Environment execution root，错误调用可污染 retained workspace。

## What Changes

- 将 current main 覆盖检查与历史收敛移动到完整 Candidate 之前；收敛后形成最终 release SHA，再生成唯一 Candidate 与 tarball。
- main 没有 release 未覆盖的独有产品内容时，创建双亲历史收敛提交但保持 release tree 字节不变；main 存在独有内容时零写入阻塞，并要求先通过 dev 正常交付。
- release selection、main reconciliation 与恢复动作必须绑定 matching active release Task、ready Environment 和实际 execution root；retained workspace 或其他 checkout 必须在 Git mutation 前被拒绝。
- release→main PR、readiness 与 publication 只消费完成历史收敛后的最终 generation；旧 Candidate、artifact 或 PR source 不得复用。
- 补充连续两个候选版本的历史分叉、main 独有内容、错误 execution root 和最终 tree 不变等契约与集成测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-main-reconciliation`: main reconciliation 改为 Candidate 前的覆盖检查与保持 release tree 不变的历史收敛；main 独有内容必须先回到 dev。
- `release-collection-model`: release Git mutation 必须在 matching release Task Environment execution root 中运行，并把收敛后的 generation 作为唯一最终源。
- `open-source-release-governance`: 候选准备顺序改为先完成最终 source 收敛，再运行一次完整 Candidate、合入 main 并发布同一制品。

## Impact

- 修改 `tools/release/release-selection.mjs`、`release-git-convergence.mjs`、release orchestration/readiness 组合与对应测试。
- 更新 Buildr release Skill、发布检查清单和 current release knowledge，使 Agent 不再在 Candidate 后修改 release source。
- 当前未发布的 rc.28 必须在修复交付 dev 后 reopen/refreeze，并以新 generation 重新运行 Candidate；已通过的旧 run 仅保留历史证据。
