## ADDED Requirements

### Requirement: Finish completion 必须写入采用的 gate 关联
Task Finish 在完成 Task Record 交付终态时 MUST 投影其 current Development handoff 中冻结的 Planning、Verification 与 Completion gate 关联。Finish MUST 使用 handoff 中的最小 identity/digest，而不是读取后续变化的专业 Result；投影失败 MUST 保留可恢复诊断并阻止 success completion。

#### Scenario: Finish 采用 current handoff
- **WHEN** Finish 已验证 current handoff 并完成 delivery 与 cleanup
- **THEN** completion projection MUST 记录该 handoff、Candidate 和三个采用 gate 的 identity/digest
- **AND** MUST NOT 执行新的 Review、Verification 或 gate 决定
