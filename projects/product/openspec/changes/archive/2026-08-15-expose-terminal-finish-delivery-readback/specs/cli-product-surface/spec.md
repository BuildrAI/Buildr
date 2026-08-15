## ADDED Requirements

### Requirement: Agent CLI 必须支持按 Task 回读 Terminal Delivery
Buildr CLI MUST 公开 `buildr task delivery inspect <task-id> [--target <canonical-workspace>] [--json]` 作为 `agent-machine` 只读命令，并 MUST 调用既有 Terminal Delivery Application 返回 `buildr.task-terminal-delivery/v1`。该命令 MUST NOT 扩展 Task Record、按 run 的 Task Finish inspect、SQLite writer 或恢复执行语义。

#### Scenario: 按 Task 回读已交付终态
- **WHEN** Agent 仅持有已完成 Task ID 并运行 `buildr task delivery inspect <task-id> --json`
- **THEN** CLI MUST 返回 `status: delivered`、`delivered: true`、Finish `runId`、`finalRemoteRef` 与 cleanup 摘要
- **AND** 结果 MUST 由 Task Record、Development handoff association 与 terminal Finish facts 的既有组合读模型生成

#### Scenario: 按 Task 回读进行中的 Finish
- **WHEN** active Task 存在 current Finish run
- **THEN** CLI MUST 返回该 run 的 `runId`、当前 `phase` 与产品生成的 `nextAction`
- **AND** 命令 MUST NOT 自动 resume、cleanup、Finish 或修改任何 current fact

#### Scenario: Task 尚无 Finish run
- **WHEN** active Task 尚无 current 或 terminal Finish run
- **THEN** CLI MUST 返回既有 `active` Terminal Delivery projection，且 `delivered` 为 false
- **AND** 查询 MUST 保持零写入

#### Scenario: 已完成 Task 的交付关联不可证明
- **WHEN** Task 已完成但 terminal Finish completion 与 Development handoff association 缺失或不匹配
- **THEN** CLI MUST 返回 `completed-unproven` 与稳定 diagnostic
- **AND** CLI MUST NOT 推测 run、final ref、cleanup 或修复事实

#### Scenario: 保持现有查询边界
- **WHEN** 用户继续运行 `buildr task inspect <task-id>` 或 `buildr task finish inspect --run <run-id>`
- **THEN** 前者 MUST 继续只返回 Task Record 结果，后者 MUST 继续按 run identity 返回 Finish 明细
- **AND** 新命令 MUST NOT 改变二者的参数、schema 或 owner

#### Scenario: 查询 Terminal Delivery 帮助
- **WHEN** 用户运行 `buildr help task delivery inspect` 或 `buildr task delivery inspect --help`
- **THEN** CLI MUST 展示按 Task ID 查询、只读边界、稳定 JSON family 与 `--target` 用法
- **AND** command metadata、help topic、unknown-command candidates 与公开 JSON registry MUST 对同一入口保持一致
