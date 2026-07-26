## Why

随包 `task-worktree` Skill 已具备正确的 v2 生命周期边界，但正文重复 contract 与 Guardrails、创建流程占比过高，且“复用不重复检查”“清除重复副本”等表述存在误读空间。需要在保持 capability 拓扑和行为不变的前提下，收敛为更短、更可执行的结构。

## What Changes

- 将 description 收敛为单句触发索引，只表达适用意图和职责边界。
- 将正文重组为职责、决策、生命周期、协作交接、授权与停止条件五部分。
- 合并重复的创建、保留、清理和 Guardrails 内容，以 v2 contract 作为稳定协作事实，不在 provider 手册中重复完整字段。
- 明确复用只跳过 create-time doctor/sync，不跳过 context 与当前状态检查；收敛已有 artifacts 前先证明 ownership 与唯一副本。
- 保持 `buildr.task-worktree-lifecycle/v2`、provider、bindings、CLI 和外部 consumer 行为不变；不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`: 随包 task-worktree guidance 必须以简洁、结构化且无歧义的方式表达既有职责和安全边界。

## Impact

- `projects/product/services/buildr/package/targets/workspace/skills/buildr/task-worktree/SKILL.md`
- Buildr package 静态校验与 task-worktree/capability 组合测试
- 自举 workspace 的 builtin source、receipt 与 Agent runtime 投射
