## Why

上一轮真实 Task Finish 虽已将正式验证压缩为一次并行 execution，但 OpenSpec convergence 仍需要 Agent 读取 delta、手工编辑 canonical specs、搬运 receipt并维护多个 cwd，导致收尾约 6分52秒且产生大量工具输出与重复错误。现在需要把可机械证明唯一结果的 sync 收敛为产品能力，同时保留语义歧义时的 Agent fallback。

## What Changes

- 新增 deterministic sync planner：只读比较 delta、baseline 与当前 canonical，生成 `safe`、`already-applied` 或 `blocked` 的结构化计划。
- 新增原子 sync apply：只消费 identity 匹配的 plan/receipt；任一 operation 不确定则整批零写入。
- 支持保守确定性操作：不存在冲突的 ADDED、唯一 REMOVED、无目标冲突的 RENAMED、baseline/current匹配的完整 MODIFIED，以及可唯一定位的完整 Scenario 增改。
- 新增产品持有的 OpenSpec convergence orchestrator，连续执行 rehearsal、pre-sync guard、deterministic apply、strict validation与post-sync guard，并持久化阶段/恢复 evidence。
- Task Finish 只消费 convergence result并在 `semantic-resolution-required` 时交回 Agent，不再要求 Agent在正常路径手工搬运 receipt或修改 canonical文件。
- 自动解析 Workspace、Product、Service与允许执行根，减少调用方维护 root/cwd组合；不安全路径在任何写入前阻塞。
- completion receipt补齐完整run timing、attempt/retry/waste与端到端耗时；full detail默认写入诊断引用而不是内联全部历史。
- 新增真实 finish benchmark，记录命令执行、Agent/tool往返、输出量近似值与恢复成本。

不包含破坏性变更；现有 agent-driven `openspec-sync-specs` 保留为 blocked fallback。

## Capabilities

### New Capabilities

- `openspec-deterministic-sync`: 定义 Buildr 如何从 delta、contract baseline 与 canonical facts 证明唯一同步结果，原子应用 identity-bound plan，并在语义歧义、输入漂移或验证失败时保持零写入和可恢复的 Agent fallback。

### Modified Capabilities

- `task-finish-execution`: 让 convergence composite消费产品 orchestrator，并补齐root/cwd解析、低噪声诊断、durable timing与真实benchmark证据。
- `openspec-contract-guard`: 让sync plan/apply与pre/post guard共享identity-bound receipt和恢复顺序。

## Impact

影响Buildr Service的OpenSpec application/domain模块、Task Finish run/application/CLI、contract guard入口、随包Task Finish Skill与capability contract、公共JSON/CLI architecture、OpenSpec/current-knowledge contract tests和Task Finish延迟优化看板。文件写入限于当前Project canonical specs；不会自动解决语义冲突、刷新事后baseline或扩大Git/外部系统授权。
