## Why

Task Finish 目前主要由一份很长的 Skill 正文驱动，步骤、证据失效、重试和副作用进度只存在于 Agent 会话中。会话切换或后半程失败后，Agent 难以可靠判断哪些动作已经完成，既会重复验证或 push，也无法让多个任务安全并发收尾。

## What Changes

- 将 Task Finish 重构为持久化的 finish run：每一步记录状态、输入 fingerprint、副作用、证据、失效依赖与 retry policy。
- 新增 `buildr task finish inspect|advance|resume` CLI；失败后只恢复 blocked/stale 及其下游，已完成且输入未变的副作用不会重复执行。
- 默认在同一用户对话中用明确 target/workdir 和 checkout-local CLI 操作 task environment；逻辑任务需要时可跨执行载体继续同一 run。
- 多个 run 独立并发；不使用 Workspace 全局锁，只对 target branch、canonical checkout、runtime sync 和默认安装等共享资源使用短 lease，并对远端 ref 做乐观并发检查。
- 把正式 affected/Candidate 放到 rebase、canonical/runtime convergence 之后，并按最终树 fingerprint 精确失效。
- 将 Task Finish Skill 精简为薄入口，保留 verification、Git、worktree、asset-review 与 current-knowledge provider 的职责边界。

这是新增 CLI 与持久化状态契约，但不破坏现有 capability id；旧的纯 Skill 收尾流程迁移为由 Agent 驱动新 run。

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `agent-task-workflows`: Task Finish 改为薄 Skill 编排持久化执行能力，并让 execution binding 取代通用 session-root/adoption 门禁。
- `task-finish-execution`: 定义可恢复 finish run、步骤状态、失效、幂等、并发 lease 与 CLI 结果证据。
- `task-environments`: `executionReady` 绑定 environment、repository、allowed roots、CLI/runtime projection 和明确 target/workdir；activation evidence 降为按影响触发的特例。
- `workspace-first-runtime-projection`: runtime projection identity 参与 execution binding，session-start activation 只作为明确验收要求下的专项 evidence。

## Impact

- `services/buildr/src/application/` 新增 Task Finish 状态机与持久化实现。
- CLI registry/help 新增 `task finish inspect|advance|resume`。
- `buildr.task-finish/v1` contract、Task Finish Skill、package manifest/integrity 与行为测试更新。
- 当前认知中的任务收尾流程更新；不新增 Workspace 全局 daemon、Agent router 或第二套任务事实源。
