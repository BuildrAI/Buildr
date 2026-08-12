## Why

真实 Task Finish 收尾已经能保证候选身份、目标分支竞态、验证证据和安全清理，但一次无冲突收尾仍耗时约 9 分钟，其中正式验证仅 50.7 秒，约 89% 墙钟时间属于 Agent/provider 手工接力。此次复盘同时证明 retained CLI 影响分类、验证 evidence lifecycle 清理和 Node runtime 选择存在稳定实现缺口，需要在继续扩展收尾流程前把正常路径收敛为产品可执行能力。

## What Changes

- 让 Task Finish 在授权、输入和 provider result contract 都可机械验证时连续调用已绑定 provider，减少逐步骤 claim、人工拼装 evidence 和 complete 往返；语义决策、Git 冲突及失败修复仍停在 Agent/用户边界。
- 修正 retained convergence 的入口影响分类，使 Buildr CLI 实现路径与自举安装规则一致，并把精确影响直接交给 runtime-install。
- 统一 production verification summary 与 cleanup provider 的 evidence lifecycle schema、边界和公开 cleanup 操作，确保 Task Finish 能在全部 consumer 完成后自动清理 transient evidence。
- 让 retained runtime install 使用已核验的 Node executable/runtime identity，不再依赖可能指向不受支持版本的交互 shell PATH。
- 补全 Task Finish 与 worktree 生命周期命令的 canonical help、参数说明和机器可操作 next action，降低无效探测调用。
- 以真实无冲突收尾 journey 验证产品执行覆盖、往返次数、清理结果和耗时归因；不把固定机器耗时作为正确性门禁。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 扩展可机械验证 provider 的连续执行、retained 影响分类、runtime identity 传递和正常路径效率证据。
- `task-verification`: 统一正式 verification evidence lifecycle 与 cleanup operation 的生产契约。
- `buildr-cli-self-update`: 让自举默认 CLI 刷新使用已验证且满足版本要求的 Node runtime identity。
- `cli-product-surface`: 完善 Task Finish/worktree 主题帮助、参数一致性和可操作诊断。

## Impact

- 影响 Buildr Service 的 Task Finish action registry/executor、verification application/provider、runtime install provider、CLI help/diagnostics 和相关 JSON contracts。
- 更新上述四个 canonical capability 的 delta specs、Task Finish/verification capability contract 与随包 Skill 指引，并补充集成与 journey 测试。
- 不改变收尾授权边界，不自动解决语义冲突，不执行 force push，不推送远端任务分支，也不降低 worktree、Git、verification 或 cleanup 的 fail-closed 门禁。
