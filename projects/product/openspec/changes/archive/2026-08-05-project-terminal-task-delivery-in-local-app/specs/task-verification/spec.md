## ADDED Requirements

### Requirement: terminal delivery association 必须证明交付目标使用了对应 Verification Result
Application 层 terminal projection MUST 只在成功 Finish 与 immutable handoff 等价，且 handoff verification gate 的 Result digest、Content Target identity 与 Verification current slot 完全一致时，返回 `verified-at-delivery` 及原始 passed/not-passed 结论。该关联 MUST NOT 改写 Verification Result、applicability 或 declaration currentness。

#### Scenario: 交付目标已验证通过
- **WHEN** completed delivered Task 的 Verification Result、handoff gate、Candidate Content Target 与 Finish identities 完全一致
- **THEN** terminal projection MUST 表达“已随交付目标验证通过”
- **AND** MUST 保留原始能力事实、coverage gaps 与 conclusion 内容

#### Scenario: 交付目标未验证通过但风险已明确接受
- **WHEN** matching handoff 保存 not-passed Verification Result digest 与合法 proceed risk decision
- **THEN** terminal projection MUST 表达“已随交付目标验证未通过”及已保存风险事实
- **AND** MUST NOT 改写为 passed

#### Scenario: active declaration currentness
- **WHEN** Task 仍 active 且调用方提供 current target/declaration inputs
- **THEN** Verification Application MUST 保持既有 current/stale/unknown 派生行为
- **AND** terminal delivery association MUST 不参与 live applicability
