## ADDED Requirements

### Requirement: Execution Record recover 必须返回稳定公共 JSON
`buildr task execution-record recover --json` MUST返回 `buildr.task-execution-record-recover-result/v1` 单一 JSON object，包含 operation、status、Task/record identity、recovery mode、portable record、transient cleanup、diagnostic、effects 与 next actions。结果 MUST不包含 SQLite/database、body locator、canonical Workspace或临时绝对路径、正文、secret、raw command、resource token或任意用户自由文本。

#### Scenario: terminal evidence 恢复成功
- **WHEN** recover 使用合法 summary 成功 seal 原 record
- **THEN** JSON MUST返回 `status: recovered`、`mode: terminal-evidence` 与真实 terminal outcome/lifecycle
- **AND** effects MUST只描述原 record seal与 owned transient cleanup

#### Scenario: 需要用户授权
- **WHEN** terminal evidence 不可用且没有 unknown outcome 授权
- **THEN** JSON MUST返回 `status: authorization-required`、零 effects与稳定 diagnostic
- **AND** next actions MUST说明授权的精确影响且不得声称原 producer 已结束

#### Scenario: unknown 已授权处置
- **WHEN** unknown outcome 授权成功终结原 record
- **THEN** JSON MUST返回 `status: attention`、`mode: authorized-unknown` 与 `outcome: unknown`
- **AND** MUST明确该 record 不是 Verification Result且后续普通 invocation 可重新执行
