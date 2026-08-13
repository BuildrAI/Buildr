## Why

上一项零差异 Delivery Adaptation 已能把冻结贡献以 `already-contained` 交付，但 retained cleanup 仍只会重建普通 changed-path containment，无法复核专用的 Agent-reviewed zero-delta proof，导致真实 run 卡在 `cleanup_pending`。同时，自举 runner 只接受 Finish final ref 或本 run 的单一后继；多个已经完成的 Formal Finish 等待激活时，后一个合法交付会让前一个 runner 永久失去入口，形成连续补洞。

## What Changes

- 让 retained cleanup 使用与 deliver 相同的确定性零差异 containment 观察器，重新核验 carrier ownership、clean baseline、零实际 delta、target ref 与 proof identity；普通 already-contained 行为保持不变。
- 让 Buildr 自举 runner 区分“本 run 的可恢复 successor”和“由 Buildr 正式交付/自举产生的 clean remote-aligned 后继链”，以当前 retained HEAD 作为本次 activation base 顺序收敛多个待激活 Result。
- 继续拒绝 merge、未知 provenance、dirty tree、local/remote 分叉、错误 trailer、非祖先和不匹配的本 run successor；不引入新的持久化状态或第二 authority。
- 增加真实 cleanup 子进程、proof 篡改、descendant activation、跨 run 顺序恢复与 fail-closed 回归验证。
- 本变更不改变 Formal Verification、Candidate、Task Contribution、Environment cleanup owner、发布或普通 Workspace 行为，不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 明确 zero-delta already-contained delivery 在 cleanup 边界必须以同一专用 proof 重新观察并可继续完成 owner cleanup。
- `task-closeout-orchestration`: 将 runner 的恢复基线从只能是 Finish final ref 扩展为可证明的 Buildr-owned clean descendant chain，并保持本 run successor 的精确幂等恢复。

## Impact

- 实现：`git-task-contribution.mjs`、`task-finish-product-executor.mjs`、`task-finish-retained-cleanup.mjs`、`skills/buildr-self-bootstrap-sync/scripts/closeout.mjs`，以及该 Skill 所属 `buildr-self-bootstrap` Component 的版本与成员完整性。
- 测试：Task Finish retained cleanup integration/system journey、self-bootstrap closeout integration、相关 contract/registry affected 选择。
- 当前认知：Change Brief、Task Finish 技术架构、Buildr Service 说明、OpenSpec Change 生命周期和 self-bootstrap Skill 指引。
- 数据与安全：继续使用 Workspace SQLite、既有 Finish run/completion、Git/Environment owner；不新增 store、schema、远程服务、HTTP 或 writer。
