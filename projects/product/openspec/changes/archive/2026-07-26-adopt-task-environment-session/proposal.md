## Why

Buildr 目前能证明 task environment 的 checkout、允许执行根、checkout-local CLI 与 Agent runtime 投射已经就绪，却不能证明承载任务的 Agent session 已以该 environment root 启动或重新进入并消费对应 runtime。对于 Codex 这类 Skills 在 session start 激活的 runtime，仅切换命令 `cwd` 会留下执行位置与能力发现来源分离的证据缺口，因此现在需要补齐 adoption/handoff 契约。

## What Changes

- 为 task environment 增加 Agent session adoption/handoff 状态与机器可读 evidence，区分 environment 已创建、session 待采用、session 已采用和无法证明。
- 要求实现型任务在采用 environment 后，由以 environment root 启动或重新进入的 Agent session 继续；只切换命令工作目录不得视为采用完成。
- 将 checkout-local runtime source、adapter activation、session workspace root 与 execution context 绑定核验，并在不一致或证据不足时 fail closed。
- 保持 runtime 隔离和 activation 事实边界：Codex Skills 仍在 session start 激活，Buildr 不承诺当前 session 因文件写入而即时重发现。
- 保持收尾边界：合并后仍从 retained checkout 同步主 Workspace runtime，不从未合并 task checkout 更新主 runtime。
- 本变更包含 task environment context/evidence schema 的向后兼容扩展，不包含有意的破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`: 增加 Agent session adoption/handoff identity、状态与 runtime-source evidence。
- `agent-task-workflows`: 增加实现型任务采用 environment 后的 session handoff 门禁及 Skills 间交接要求。
- `workspace-first-runtime-projection`: 明确 session-start runtime 的可证明边界以及供 task environment 消费的 activation/runtime-source evidence。

## Impact

- CLI：`buildr worktree create/inspect/context` 的 JSON evidence 与可能的 adoption/handoff 辅助入口。
- Runtime：adapter activation metadata、checkout-local runtime source identity 与 Agent-readable guidance。
- Skills：`task-worktree`、`task-triage`、OpenSpec sidebar、验证和收尾 consumers 的 context handoff。
- 测试与文档：task environment integration tests、runtime adapter contract tests、公开 Agent runtime 与 task workflow 文档。
