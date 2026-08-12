## MODIFIED Requirements

### Requirement: Task Environment 必须提供三个薄公共 CLI action
Buildr CLI MUST公开`buildr task environment prepare <task-id>`、`inspect <task-id>`与`cleanup <task-id>`，并 MUST在帮助中将它们描述为Task Environment Application的确定性客户端。CLI interface MUST只拥有参数解析、Application调用、输出和退出码；Application MUST NOT解析argv、打印stdout/stderr或修改process exit state。Local App MUST使用同一Application的saved-current read而不是公共CLI live inspect。

#### Scenario: 查看 Task Environment 帮助
- **WHEN** 用户运行`buildr help task environment`或任一action help
- **THEN** 帮助 MUST展示三个action、canonical Workspace target、Task ID、effects、授权与停止条件
- **AND** MUST说明prepare承担首次准备/幂等恢复，inspect执行零写入current-machine observation，Environment Receipt不属于Task Record

#### Scenario: 准备或恢复 Task Environment
- **WHEN** 调用方运行`buildr task environment prepare <task-id>`
- **THEN** CLI MUST返回ready/blocked、实际执行根、逐dependency-root facts、精确effects与next action
- **AND** MUST NOT注册单独restore、接受完整Receipt/next state或直接调用Git provider形成总结果

#### Scenario: 只读检查 Task Environment
- **WHEN** 调用方运行`buildr task environment inspect <task-id>`
- **THEN** CLI MUST只读返回Receipt availability、observedAt、当前dependency-root probe与Environment read model
- **AND** MUST NOT写Receipt、运行npm ci、创建/修复node_modules、创建checkout、启动/停止资源或cleanup

#### Scenario: 清理 Task Environment
- **WHEN** 调用方运行`buildr task environment cleanup <task-id>`
- **THEN** CLI MUST只把已登记Finish handoff或明确abandon authorization交给Application
- **AND** MUST NOT接受任意shell、删除路径、branch/path ownership声明或caller-authored provider result

#### Scenario: 内部资源动作不公开
- **WHEN** 用户检查根帮助、topic help、command registry或public JSON coverage
- **THEN** `resource register/release`与saved-current read MUST NOT作为公共CLI action出现
- **AND** Local App和Preview MUST直接复用Application而不是shell out或手写Receipt
