## ADDED Requirements

### Requirement: OpenSpec Converge 必须明确使用 Task execution root
`buildr openspec converge` MUST将 `--target` 表达并校验为当前 Task Environment 允许的 execution root，而不是 canonical Workspace authority root。CLI MUST在 target 中无法解析 active Change 时返回零写入诊断，要求 Agent使用 matching Environment Receipt 的 `execution.workdir`，并 MUST NOT扫描、猜测或自动选择其他 worktree。

#### Scenario: CLI 展示 converge target
- **WHEN** Agent读取 `buildr openspec converge` 的命令帮助
- **THEN** `--target` MUST显示为 `<task-execution-root>` 或等价明确表述
- **AND** MUST不使用无法区分 canonical Workspace 与 Task Environment 的 `<workspace>` 或 `<dir>` 占位符

#### Scenario: canonical Workspace 看不到 active Change
- **WHEN** Agent把 canonical Workspace 作为 converge target，且 active Change 只存在于 matching Task execution root
- **THEN** command MUST在 canonical、receipt 与 archive 零写入状态返回 active Change not found 诊断
- **AND** next action MUST要求从 Environment Receipt 使用 `execution.workdir` 重试，不得自动搜索或修改 canonical Workspace绕过
