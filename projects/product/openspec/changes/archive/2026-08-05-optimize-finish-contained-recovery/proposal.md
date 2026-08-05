## Why

Task Finish 在 carrier 已推送但 retained Doctor 等待 Buildr 自举 Workspace 同步时，现有 self-bootstrap 流程只能在 Formal Finish 成功后运行，容易形成阻塞后的提前 push 与自造 target-race。并行交付进一步推进 target 时，即使新 target 已完整包含已推送 carrier，Finish 仍会重复应用 Task Contribution 并要求非空 Delivery Adaptation，造成假冲突、无功能提交和额外恢复。

## What Changes

- 让 Buildr 自举 Workspace 的 `buildr-self-bootstrap-sync` 支持受限的两段式维护：仅在精确 Finish/Doctor/package 条件成立时先生成 clean 的本地 sync commit，Formal Finish 成功后再普通 push、远端回读并执行最终 Doctor。
- 为通用 Task Finish 增加 `already-contained` 恢复：当最新 target 可确定性证明为已推送 carrier 的后代，且 carrier 的任务贡献结果仍被逐路径完整保留时，直接采用最新 target 完成交付，不重复应用 Task Contribution，也不要求非空适配提交。
- 保持 fail-closed：无法证明祖先关系、逐路径内容/模式保留、current handoff 或 source identity 时继续走 target-race / Delivery Adaptation；非 `components.update_available` Doctor 问题不得由自举流程放行。
- 增加产品、Workspace Component 与端到端恢复测试；不改变 Candidate generation、Formal Verification、Completion Review 或 Task Environment authority。

不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：增加已推送 carrier 被最新 target 完整包含时的确定性 `already-contained` 交付恢复。
- `agent-task-workflows`：允许 Buildr 自举 Workspace Contribution 在严格条件下先准备本地 sync commit，并在 Formal Finish 成功后发布；通用 Task Finish 不感知自举逻辑。
- `buildr-package-assets`：验证两段式 self-bootstrap、`already-contained` 恢复及其 fail-closed 边界。

## Impact

- Product：Task Finish Git Task Contribution、target-race resume、delivery result 与测试 fixtures。
- Workspace assets：`buildr-self-bootstrap` Component Contribution 与 `buildr-self-bootstrap-sync` Skill。
- OpenSpec：Task Finish、Agent workflow 与 package verification canonical requirements。
- 不新增通用插件、activation registry、第二交付 adapter 或全局 Doctor 例外。
