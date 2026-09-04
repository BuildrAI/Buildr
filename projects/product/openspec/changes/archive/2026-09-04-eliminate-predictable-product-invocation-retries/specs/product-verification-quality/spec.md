## ADDED Requirements

### Requirement: Agent 面向 Product 验证必须从 repository-owned wrapper 启动
Buildr Product 的 Project 测试地图、当前验证说明与 Candidate 操作指引 MUST 将 `tools/development/run-development-npm` 或等价 repository-owned wrapper 作为 Agent 首选入口，并 MUST 在该入口内选择精确 development Node 后再调用 npm script。裸 `npm run` MAY 保留为已激活正确 Node 环境中的兼容入口，但 MUST NOT 成为 Agent 默认执行指引。

#### Scenario: Agent 执行完整 Candidate
- **WHEN** Agent 在 Product checkout 中执行完整 Candidate，且系统 PATH Node 与 `.node-version` 不同
- **THEN** 文档和运行入口 MUST 引导同一次调用通过 repository-owned wrapper 启动 `test:candidate`
- **AND** 全部后代 Node/npm PATH MUST 绑定该 wrapper 选择的精确 Node

#### Scenario: Project 测试地图提供命令
- **WHEN** Agent 从 `verification.yml` 选择 Buildr 测试体系
- **THEN** Agent MUST 原样执行声明的 wrapper `argv` 与 `cwd`
- **AND** MUST NOT 将它简化为系统 PATH 上的裸 `npm`、`node` 或等价命令
