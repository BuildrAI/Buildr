## ADDED Requirements

### Requirement: Release selection 必须把 main reconciliation 作为独立 provenance
Release selection MUST继续只从精确 dev baseline 和明确 `cherry-pick -x` source commits 构建；为解决当前 main 漂移而产生的 merge commit MUST作为独立 reconciliation provenance 记录，MUST NOT伪装成 `sourceDevCommit`，且 MUST绑定前一 frozen selection、main parent、release parent、resolution identity 和新 generation。

#### Scenario: 记录 main reconciliation
- **WHEN** frozen selection 为了进入当前 main 需要解决冲突并产生 merge commit
- **THEN** selection read model MUST保留原 baseline 与 ordered source chain
- **AND** MUST追加独立 reconciliation entry，包含 main parent、release parent、post commit/tree、resolution identity 和 generation

#### Scenario: reconciliation 后继续读取 selection
- **WHEN** consumer 请求新的 release selection
- **THEN** owner MUST同时返回 dev selection provenance 与 main reconciliation provenance
- **AND** MUST拒绝把 reconciliation commit作为可再次 cherry-pick 的 dev source

#### Scenario: reconciliation 失败
- **WHEN** 冲突未解决、main/ref identity 漂移或目标版本已有公开发布事实
- **THEN** selection owner MUST返回 fail-closed finding 和 pre-operation identity
- **AND** MUST不移动 frozen ref、覆盖 release branch 或递增 generation
