## MODIFIED Requirements

### Requirement: Verification JSON registry 必须与 command registry 同步
公开 schema registry、CLI registry、help/architecture verification 与 npm package parity MUST 同时登记 `verificationPlanResult`、`verificationExecution`、`verificationEvidenceCleanup` 和 `taskVerificationOperationResult`，并 MUST 删除旧 `verificationRun` schema key 与 `buildr.verification-run/v1` identity。`verificationPlanResult` MUST 使用 closed `buildr.verification-plan-result/v1` envelope，包含原始 `buildr.verification-plan/v1`、只读 Preparation preview、零副作用与下一步；无 formal Environment 的 `verification plan` MUST 继续返回 raw Plan v1。

#### Scenario: 枚举公开 JSON families
- **WHEN** product tests 枚举 `PUBLIC_JSON_SCHEMAS`
- **THEN** registry MUST 精确包含四个当前 Verification families
- **AND** checkout 与 installed CLI MUST 输出相同 schema identities

#### Scenario: 正式与普通 Plan 输出兼容
- **WHEN** 调用方分别执行绑定 matching Task Environment 的 formal Plan 和未绑定 Environment 的普通 Plan
- **THEN** formal Plan MUST 返回 `buildr.verification-plan-result/v1`
- **AND** 普通 Plan MUST 继续返回 `buildr.verification-plan/v1`
- **AND** 同版 `verification run --plan` MUST 接受两种输出
