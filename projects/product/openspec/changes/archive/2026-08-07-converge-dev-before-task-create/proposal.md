## Why

正式 Task 当前会直接基于本机已有 checkout 创建记录和 Environment；当统一开发分支 `dev` 落后于 `origin/dev` 或已经分叉时，新任务可能从陈旧基线开始。需要在 Task Record `create` 之前收敛完整 repository set，并在任何仓库无法安全 rebase 时停止创建，避免把基线问题带入后续研发与验证。

## What Changes

- `task-triage` 在正式 Task `create` 前解析完整 repository set，并要求每个仓库证明当前分支为 clean `dev`、upstream 为 `origin/dev`。
- 通过 selected `buildr.git-operations/v1` provider 对每个仓库依次执行 `fetch origin dev` 与 `rebase origin/dev`；全部成功后才调用 Task Record provider。
- fetch、分支/upstream/clean 前置条件、rebase 或冲突恢复失败时阻塞 Task 创建，报告每个仓库已经发生的 effects 与当前 Git facts，不自动 stash、切换分支、merge、force push 或改变策略。
- rebase 冲突且能证明 clean pre-state 时执行有界 `rebase --abort`，恢复失败则保留现场并报告；成功 tree transition 继续执行 Buildr workspace transition check。
- 更新内置 Skill、capability dependency、产品验证与 current knowledge，使 source、package 和 Agent runtime 保持一致。
- **BREAKING**：正式 Task 创建不再允许从非 clean `dev`、非 `origin/dev` upstream 或未完成远端收敛的 repository set 直接进入 Task Record `create`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：增加正式 Task 创建前统一 `dev` 远端基线收敛、失败阻塞与部分 effects 报告要求。
- `buildr-package-assets`：验证随包 `task-triage`、Git Operations 条件依赖、授权边界和 runtime 投射保持新行为。

## Impact

- 受影响资产：`task-triage` Skill、workspace Skill manifest/capability graph、Git Operations consumer 组合、对应 contract/static/integration tests。
- Task Record Application、SQLite schema 和 `buildr task create` CLI 保持纯记录动作，不直接执行 Git。
- Task Environment 继续不自动 fetch/rebase；它只消费创建成功后的 Task 和已收敛源码基线。
