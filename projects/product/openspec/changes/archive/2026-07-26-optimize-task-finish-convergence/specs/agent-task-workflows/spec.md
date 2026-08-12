## MODIFIED Requirements

### Requirement: Task Finish 使用持久化执行架构
Buildr MUST 提供实现 `buildr.task-finish/v1` 的薄 `task-finish` Workspace Skill，把当前轮次明确的“收尾”作为受限授权，并使用持久化 finish run 编排 selected verification、Git integration、worktree lifecycle、asset review 与 current knowledge providers。Skill MUST NOT 复制 provider policy 或依赖单个 Agent session 保存步骤进度。

#### Scenario: 默认在同一用户对话继续
- **WHEN** finish run 的 environment execution binding 有效
- **THEN** Task Finish MUST 在同一用户对话继续同一 task/change/run
- **AND** 后台 session MUST 只是可选执行载体，不得成为 task environment 成立条件

#### Scenario: provider 步骤失败后恢复
- **WHEN** 某个 provider action blocked 且早期副作用已经 passed
- **THEN** Task Finish MUST 保存 checkpoint 并从 blocked/stale 边界恢复
- **AND** MUST NOT 要求 Agent 从头复述或重跑整个 Skill
