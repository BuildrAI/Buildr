## Why

当前 release selection 一旦 freeze 就永久禁止追加维护者明确选择的修复提交，即使完整 Candidate 尚未成功且没有产生任何公开发布事实；这与 release branch 作为人工选择集合的目标不一致。同时，`准备候选版` Task 在只完成版本材料和普通 Task delivery 后就进入 completed，导致 Task 顶层状态与其明确包含 Candidate、release→main 和 readiness 的 intent 相矛盾。

## What Changes

- **BREAKING**：把 release selection 的 `frozen` 从永久封闭状态改为可受控 reopen 的候选快照；只有在不存在 tag、npm version、GitHub Release 或已开始 protected publication transaction 等公开/不可逆发布事实时，维护者才能明确授权 reopen。
- reopen 必须保留旧 freeze identity、对应失败或过期 Candidate 的审计事实，并让所有旧 Candidate、artifact、readiness 与 transaction context 明确 stale；后续 update 仍只允许逐个 `cherry-pick -x`，完成后形成新 generation 并重新 freeze。
- 为 release preparation 增加完成语义：版本材料、support Task delivery、self-bootstrap 或一次失败 Candidate 只是中间事实；只有 current release 的完整 Candidate、唯一 tarball、release→main tree equality 和无副作用 readiness 全部成立，release Task 才能完成。
- 更新 `buildr-release` 的 Agent 指引与契约测试，使失败 Candidate 后继续使用同一 release Task/selection，并禁止提前调用 Task Finish/complete 冒充候选版准备完成。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-collection-model`：允许未进入 publication 的 frozen selection 受控 reopen/refreeze，并保存历史 freeze 审计身份和下游失效事实。
- `agent-task-workflows`：明确 release preparation Task 的生命周期覆盖完整准备结果，Candidate/readiness 未通过时不得 completed。

## Impact

- 修改 Product canonical specs、`buildr-release` Skill 和 release selection owner/read model。
- 修改 release selection CLI、集成测试与 release model governance contract tests。
- 不改变 Candidate workflow、tarball producer、protected publish workflow 或 npm/GitHub 公共发布权限；publication 仍需独立明确授权。
