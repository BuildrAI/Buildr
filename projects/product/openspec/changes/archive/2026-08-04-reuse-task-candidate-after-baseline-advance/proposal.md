## Why

当前 Task Finish 把 Candidate 冻结后的目标分支前进一律视为 Candidate 失效，即使任务贡献没有变化且能够在最新目标上确定性、无冲突地应用，也会返回 Task Development 并重复正式 Verification、Candidate freeze、Completion Review 与 handoff。这混淆了任务贡献（Task Contribution）和交付基线（Delivery Baseline），增加了重复验证与 generation 噪声。

## What Changes

- **BREAKING**：收敛现有 `task-finish.target-race` 语义；目标分支前进不再自动使 Task Candidate 或 Development handoff 失效。
- Task Finish 在隔离的交付载体（Delivery Carrier）上，以最新目标 ref 作为交付基线，机械应用原任务贡献；不提交、rebase 或改写原 Task worktree。
- 只有 Git 应用无冲突、原 Task Content Target/handoff 仍 current，且应用前后的任务贡献 identity 等价时，才复用既有 Candidate、Verification Result、Completion Review、proceed decision 与 handoff；Candidate generation 保持不变，`formalVerificationExecutions` 保持 `0`。
- 冲突、任务贡献漂移、identity 不等价、缺少可证明事实或需要语义判断时 fail closed 返回 Task Development；不自动解决冲突、不 force push、不伪造复用 evidence。
- 保留 `preflight → prepare → verify → deliver → cleanup` 主线；目标在 carrier prepare 后再次前进时，只用产品生成的精确 resume token 重做 `prepare → verify → deliver → cleanup`，不创建新 Candidate 或重跑正式验证。
- 明确 Buildr 的证明只覆盖 Git 应用与 identity 等价，不以路径是否重叠推断语义安全；语义判断继续由 Agent、Project 与既有 verification policy 承担。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 修改目标分支前进、隔离 Delivery Carrier、任务贡献等价、恢复与 cleanup 的要求。
- `task-environments`: 允许 Environment Git provider 以可独立复算的任务贡献等价证明替代祖先关系，安全清理未被改写的原 Task worktree。
- `agent-task-workflows`: 修改 `task-finish` Skill 对 target-race、Candidate 复用、Development 回退和术语的用户工作流契约。

## Impact

- 受影响实现：`src/application/task-finish/`、Git carrier/proof helper、retained cleanup 与 Task Environment Git cleanup 交接。
- 受影响测试：Task Finish run、真实 Git delivery、target-race resume、冲突/贡献漂移、远端回读与 Environment cleanup journey。
- 受影响产品资产：Task Finish Skill、Buildr Service/current knowledge 中的 lifecycle 说明，以及相关静态契约断言。
- 不改变 Task Verification Result authority、Task Review Result authority、Task Development Candidate generation authority、公共 Finish 阶段模型或 CLI 参数。
