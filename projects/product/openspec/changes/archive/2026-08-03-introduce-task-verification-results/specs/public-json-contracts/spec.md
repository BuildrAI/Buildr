## MODIFIED Requirements

### Requirement: Verification run 必须提供稳定公开 JSON identity
`buildr verification run --json` MUST 输出 `buildr.verification-execution/v1`，并 MUST 在成功、capability failure 与调用前 invalid request 路径保持单一 stdout JSON object。Payload MUST 区分 transient execution status、Project/declaration identity、requested target identity、实际 checks、精确 capability/resource authorization、真实 timing、target stability、Workspace Node/Environment execution context 与 evidence lifecycle；MUST NOT 声称 current Result、Candidate completeness 或 required assurance。

#### Scenario: 验证成功输出 JSON
- **WHEN** 所有显式 command capabilities 完成且 target observation 保持稳定
- **THEN** JSON MUST 返回 `status: passed`、每项 check facts、declaration identity、duration 与 transient evidence reference

#### Scenario: 验证业务失败输出 JSON
- **WHEN** capability 执行失败、资源等待失败或 execution context 在启动后失稳
- **THEN** stdout MUST 仍返回同一 `buildr.verification-execution/v1` family 的失败摘要并以非零状态退出
- **AND** payload MUST 包含已完成 checks、具体 failures、cleanup 状态和可用的结构化诊断，且 MUST NOT 写 current Result

#### Scenario: invalid request
- **WHEN** 参数、v2 declaration、capability identity、invocation kind、执行根或授权不合法
- **THEN** JSON MUST 返回 `status: failed`、空 checks 与结构化 error
- **AND** MUST 不生成 current Result 或误报 completed execution

## ADDED Requirements

### Requirement: Task Verification CLI 必须提供稳定 operation JSON identity
`task verification inspect|record --json` MUST 输出 `buildr.task-verification-operation-result/v1`，包含 operation、`inspected|recorded|blocked` status、Task ID、单一 result slot、diagnostic、effects 与 nextActions。Result digest 与 applicability MUST 位于 read model envelope，不得写入 persisted Result。

#### Scenario: inspect 空 slot
- **WHEN** Task 没有 current Verification Result
- **THEN** payload MUST 返回 `present: false`、null Result/digest/applicability 与零 effects

#### Scenario: record blocked
- **WHEN** Application 拒绝 input、Task terminal、declaration invalid 或 persistence 失败
- **THEN** payload MUST 返回 blocked、具体 diagnostic 与零 effects
- **AND** stdout MUST 不混入普通日志

### Requirement: Verification JSON registry 必须与 command registry 同步
公开 schema registry、CLI registry、help/architecture verification 与 npm package parity MUST 同时登记 `verificationExecution`、`verificationEvidenceCleanup` 和 `taskVerificationOperationResult`，并 MUST 删除旧 `verificationRun` schema key 与 `buildr.verification-run/v1` identity。

#### Scenario: 枚举公开 JSON families
- **WHEN** product tests 枚举 `PUBLIC_JSON_SCHEMAS`
- **THEN** registry MUST 精确包含三个当前 Verification families
- **AND** checkout 与 installed CLI MUST 输出相同 schema identities
