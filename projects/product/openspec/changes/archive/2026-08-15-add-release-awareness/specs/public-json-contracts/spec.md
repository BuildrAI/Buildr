## ADDED Requirements

### Requirement: Buildr update 双轨道 JSON 必须使用 v2 identity
`buildr update check --json` MUST输出 `buildr.update-check/v2`，`buildr update --json` MUST输出 `buildr.update/v2`；两者 MUST用 closed 双轨道结构替代 v1 单一 `available.version` 语义。

#### Scenario: Agent 检查双轨道更新
- **WHEN** Agent 运行 `buildr update check --json`
- **THEN** payload MUST包含 `current`、`selectedTrack`、`tracks.stable`、`tracks.candidate`、`notices`、`observedAt`、`freshness`、`blockingReasons` 与 `nextActions`
- **AND** 每个轨道 MUST包含 `tag`、`version`、`status`、`available` 与 `installable`

#### Scenario: Agent 执行指定轨道更新
- **WHEN** Agent 运行 `buildr update --track <track> --json`
- **THEN** payload MUST使用 `buildr.update/v2` 并明确 selectedTrack、精确目标版本、执行状态与副作用

#### Scenario: v1 consumer 迁移
- **WHEN** consumer 仍只理解 `buildr.update-check/v1` 或 `buildr.update/v1`
- **THEN** consumer MUST升级为读取 v2 tracks
- **AND** Buildr MUST NOT在 v1 identity 下改变 `available.version` 的既有语义

### Requirement: Doctor Release Awareness JSON 必须保持非诊断投影
`buildr.doctor/v1` MAY additive增加 `releaseAwareness` 与 `notices`，但这些字段 MUST不改变既有 `findings`、`repairPlan`、`nextSteps`、`ok` 与 `health` 的语义。

#### Scenario: Doctor 返回版本通知
- **WHEN** Doctor JSON包含 releaseAwareness
- **THEN** schema coverage MUST证明 compact/full 都返回合法结构
- **AND** Registry失败 fixture MUST证明既有 health 字段保持不变
