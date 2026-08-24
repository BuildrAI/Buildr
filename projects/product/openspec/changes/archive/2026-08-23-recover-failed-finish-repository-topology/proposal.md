## Why

首次真实恢复演练表明，`repositorySetIdentity` 包含 `taskContribution`，因此 Development Handoff generation 更新时它必然变化。把该 identity 相等当作“仓库集合未变化”会错误拒绝本应安全恢复的同仓库、同远端、同分支场景。

## What Changes

- 将旧失败 run 的恢复边界从 `repositorySetIdentity` 相等改为可证明的 repository topology 相等。
- topology 精确比较 selector、source path、retained/task roots、Environment branch、target branch、remote 与 disposition，不比较随 Handoff 更新的 Task Contribution。
- 保持任何真实仓库、路径、branch、remote 或 disposition 漂移时 fail closed。
- 增加真实 `repositorySetIdentity` 因 Task Contribution 更新而变化的恢复测试，并保留 topology 冲突负向测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：明确失败 run recovery 使用 repository topology 而不是 contribution-bearing repository-set identity 判断仓库边界。

## Impact

影响 Task Finish delivery reconciliation、对应 Integration tests 与 `task-finish-execution` canonical contract；不改变普通 `task finish run`、远端包含证明、carrier ownership 或下游副作用禁令。
