## Why

当原 Task worktree 在旧 Finish run 创建后发生真实贡献漂移，新的 Candidate 即使已经形成，也会被旧 run/carrier 持续占用 current slot；在新贡献尚未交付远端时，Agent 只能绕行直接 Git/PR 或人工处理现场。现有统一 Finish facts 与安全原语已经能识别大部分资格，但缺少一条不依赖远端 Delivery 证明、又不会丢失 carrier 内容的显式安全换代路径。

## What Changes

- 在 Product 首次返回 prepare blocked/failed carrier 时记录 Product-owned carrier 可丢弃性证明，区分最初交接现场与 Agent 后续修改。
- 增加显式、带 current-row fence 的“退休旧 run 并为 current Handoff 创建新 run”安全原语；普通 `task finish run` 不静默删除旧现场。
- 让 `run`、`reconcile`、Finish current facts 与 Task Entry Snapshot 复用同一恢复资格判断，同时保持各自的远端证明和副作用边界。
- 在 `task next` 的 Finish 投影中暴露 `stale-run-retirable` blocker/disposition、必要前置条件与显式能力，不替 Agent 自动选择或执行。
- 补充 carrier 被修改、lease/副作用、topology/current-row 漂移及进程中断等正反 System、Integration 与 Unit 旅程。
- 不包含破坏性变更：历史 run 或缺少新证明的 run 继续关闭式阻断；正常 run、同 run resume 与远端 reconciliation 的既有行为保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 增加无远端 Delivery 前提下、仅针对可证明无副作用且 carrier 无不可丢失内容的旧 run 显式安全换代契约，以及相应只读恢复投影。

## Impact

- 影响 Task Finish current facts、恢复资格、carrier cleanup、SQLite current-run 原子转换、CLI/Application 显式动作和 Task Entry Snapshot。
- 影响 `task-finish-execution` canonical spec、Buildr Service 实现及 Unit/Integration/System 测试。
- 不改变 Task Development、Task Verification、Task Review、Git Operations、Task Environment 或 Task Record 的 writer authority，也不新增 capability binding 或外部依赖。
