## ADDED Requirements

### Requirement: 已初始化 Workspace 的 Buildr 入口必须消费 Workspace Node identity
Buildr development/installed launcher MUST 在执行普通 Workspace 命令前解析 Workspace Node 声明并使用对应受管 executable。普通 PATH 中的兼容或不兼容 Node MUST NOT 覆盖已确定 identity；package `engines.node` MUST 继续约束没有 Workspace context 的原始 npm 入口。

#### Scenario: 已声明 runtime 可用
- **WHEN** 从已初始化 Workspace 调用 Buildr 且受管 Node runtime 可用
- **THEN** launcher MUST 使用声明版本启动 CLI
- **AND** MUST NOT 选择 PATH 中更早的 Node 18、Node 23 或其他版本

#### Scenario: runtime 缺失时执行恢复命令
- **WHEN** Workspace 声明存在但受管 runtime 缺失，调用命令是 `doctor` 或 `sync`
- **THEN** launcher MAY 使用满足 `engines.node` 的 bootstrap Node 启动只读诊断或声明驱动的恢复
- **AND** bootstrap Node MUST NOT 成为新的 Workspace identity 或修改版本声明

#### Scenario: runtime 缺失时执行普通命令
- **WHEN** Workspace 声明存在但受管 runtime 缺失，调用命令不是允许的 bootstrap/recovery command
- **THEN** launcher MUST fail closed 并建议运行 `sync`
- **AND** MUST NOT 从 PATH 选择另一个兼容 Node 继续普通执行
