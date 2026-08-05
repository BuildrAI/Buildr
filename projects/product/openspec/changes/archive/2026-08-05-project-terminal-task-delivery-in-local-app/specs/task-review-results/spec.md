## ADDED Requirements

### Requirement: terminal delivery association 必须与 Review current applicability 分离
Application 层 terminal projection MUST 只在成功 Finish 与 immutable handoff 等价，且 handoff gate 保存的 `resultDigest`、`targetIdentity` 与当前 Review slot 完全一致时，将 Result 标记为 `adopted-at-delivery`。该状态 MUST NOT 命名为 current applicability，MUST NOT 写回 Review Result 或 SQLite。

#### Scenario: Completion Review 已随交付候选采用
- **WHEN** completed delivered Task 的 Completion Result digest 与 Candidate target identity 均匹配 handoff gate
- **THEN** terminal projection MUST 表达“已随交付候选采用”及原始 conclusion
- **AND** current applicability 若另有结果 MUST 作为独立次要事实

#### Scenario: Planning Review missing 且 gate not-applicable
- **WHEN** Planning Review slot missing，但 Development handoff planning gate disposition 为 not-applicable
- **THEN** Review slot MUST 仍显示未记录
- **AND** terminal projection MUST 另行展示 gate disposition、summary 与 source，不得伪造 Planning Result

#### Scenario: digest 或 target identity 不匹配
- **WHEN** Review slot 与 handoff gate 的 digest 或 target identity 任一不一致
- **THEN** terminal projection MUST fail closed，MUST NOT 标记 adopted-at-delivery
