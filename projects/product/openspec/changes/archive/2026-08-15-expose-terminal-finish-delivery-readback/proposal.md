## Why

Finish 的 terminal delivery 已经保存在规范化只读模型中，但公开 CLI 只能先取得 Finish run ID 再按 `--run` 查询。stdout 丢失或上下文切换后，Agent 仅凭 Task ID 无法稳定回读最终远端引用、清理状态和恢复入口，必须转入内部调查。

现在需要补齐按 Task 查询的公开只读入口，使已存在的终态事实可恢复、可自动化消费。本变更不包含破坏性变更。

## What Changes

- 新增 `buildr task delivery inspect <task-id>` agent-machine CLI，按 Task ID 返回既有 Terminal Delivery read model。
- 输出稳定暴露 terminal delivery 状态、Finish run ID、最终远端引用、清理事实，以及未完成时的下一恢复动作。
- 复用现有 `inspectTaskTerminalDelivery` application 与 `buildr.task-terminal-delivery/v1` schema，不新增存储、writer、历史模型或第二状态权威。
- 保持 `task inspect` 的 Task Record 语义，以及 `task finish inspect --run` 的按运行明细查询语义不变。
- 补充 CLI 契约、参考文档与自动化测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-product-surface`: 增加按 Task ID 查询 Terminal Delivery 的公开只读命令及稳定 JSON 输出契约。

## Impact

- 影响 Buildr npm package 的 CLI registry、只读命令 adapter、公开 JSON schema 注册、CLI 文档与测试。
- 复用现有 Terminal Delivery Application 和 SQLite 读模型，不改变数据库 schema、Task/Finish 生命周期或 Local App 行为。
- 与当前验证预检、OpenSpec 预检及 Candidate 验证编排优化不存在语义依赖，可并行实施；若同时修改 CLI registry 或文档，集成时仅需处理普通文件级冲突。
