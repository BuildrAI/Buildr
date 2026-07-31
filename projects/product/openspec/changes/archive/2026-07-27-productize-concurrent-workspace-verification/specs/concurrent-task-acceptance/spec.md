## ADDED Requirements

### Requirement: 双任务验收必须消费正式 Workspace 验证入口
Candidate 双任务组合验收 MUST 在普通临时 Buildr Workspace 中使用 checkout 或已安装 CLI 的 `verification run`，以两个 canonical task environment 并发执行 Project 声明，而不得直接把 `test/verification` 内部模块作为通用能力的替代证据。

#### Scenario: 两个 task 并发验证普通 Project
- **WHEN** 验收在两个 task environment 中同时运行包含 isolated/namespaced 与 coordinated 资源的 Project 验证计划
- **THEN** 可并行 worker MUST 有真实执行重叠，共享 coordinated resource MUST 排队
- **AND** 两份摘要 MUST 分别绑定自己的 environment、candidate 与非空 `evidenceIdentity`

### Requirement: 双任务验收必须覆盖 runtime 所有权负向清理
Candidate 双任务组合验收 MUST 证明错误 owner 无法停止另一 task 的 preview，且运行中 task-owned preview/process 会阻止 worktree cleanup；最终清理 MUST 通过产品入口由真实 owner 完成。

#### Scenario: 错误 owner 与提前清理均被拒绝
- **WHEN** task A 尝试停止 task B 的 preview，或 task B 在 preview 存活时请求 cleanup environment
- **THEN** 两个动作 MUST 在不改变 task B 运行状态或 checkout 的情况下失败
- **AND** task B 使用正确 receipt 停止 preview 后，正式 cleanup MUST 成功且 retained Workspace 保持健康
