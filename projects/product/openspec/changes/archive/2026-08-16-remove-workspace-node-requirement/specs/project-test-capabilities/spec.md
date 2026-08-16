## MODIFIED Requirements

### Requirement: Invocation 必须引用既有且有界的验证操作
`invocation.kind` MUST 为 `command|agent`。command MUST 提供非空 argv 与不逃逸 Project root 的 cwd；agent MUST 提供非空、可移植的 bounded instructions。Buildr MUST 只引用已有命令、脚本、CI 对应本地入口或 Agent 操作，不得把 declaration 当作测试实现，也不得为所有capability隐式注入Node runtime。

#### Scenario: command invocation
- **WHEN** capability 使用 `kind: command`
- **THEN** runner MUST 从 Project root 解析 cwd 并按声明argv与当前受控执行环境启动命令
- **AND** cwd 逃逸、不存在或首个executable不可解析时 MUST 在启动前失败
- **AND** failure MUST只归属于该capability execution，不得把Workspace标记为不健康

#### Scenario: bounded Agent invocation
- **WHEN** capability 使用 `kind: agent`
- **THEN** instructions MUST 明确有限操作与完成事实
- **AND** command runner MUST 不尝试自动执行该 capability
