## Why

Buildr Product 的精确开发 Node 与 canonical Workspace writer 保护都已存在，但 Agent 面向入口仍允许先调用必然失败的 runtime，再根据诊断切换。重复的首次失败增加执行时间和噪声，也让正确保护被误解为需要恢复的异常。

## What Changes

- Product checkout 的 Agent 面向验证入口在启动任何 npm 生命周期前选择并核验 `.node-version` 对应的精确 Node，同时保持显式 `BUILDR_NODE` 的 fail-closed 语义。
- Project 测试地图、当前验证说明与 Candidate 指引统一暴露 repository-owned wrapper，不再把裸 `npm run` 作为 Agent 首选入口。
- Task Verification Skill 在自举 task worktree 中把“候选执行检查”和“retained controller 写 current 报告”分开，并在首次 `inspect|record` 前选择 canonical writer。
- 候选 runtime 对 retained Workspace 的 provenance rejection 保持不变；错误路径继续保证零写入，并提供可直接执行的 retained 入口诊断。
- 增加 hostile PATH 与 candidate-writer 首次路由回归覆盖。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `npm-cli-package`: 开发 checkout 的 Agent 面向入口必须在首次 npm/Node 进程前完成精确 Node 选择。
- `product-verification-quality`: Product 验证说明和入口必须以 repository-owned wrapper 作为 Agent canonical invocation，并覆盖 hostile PATH。
- `task-verification`: 自举场景的测试执行与 current 报告写入必须在调用前选择各自合法 runtime。
- `agent-task-workflows`: 投射给 Agent 的 Task Verification 工作方法必须避免从候选 worktree 首次尝试 canonical writer。

## Impact

- `projects/product/services/buildr/tools/development/` 的开发 Node/npm wrapper 与解析器。
- `projects/product/verification.yml`、Product verification 文档与发布检查说明。
- 随包 `task-verification` Skill、能力契约、CLI 诊断及对应 contract/integration tests。
- 不修改 Task Verification report schema、Workspace SQLite schema、writer provenance guard、Task 状态或验证语义。
