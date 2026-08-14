## ADDED Requirements

### Requirement: Task Finish Skill 必须为 bootstrap recovery取得单独明确授权

Task Finish Skill MUST只在retained Finish Result或Execution Record证明existing run停止于受支持的`product-phase-provider` preflight/prepare边界、无交付副作用，且repair checkout current、clean、committed时提出bootstrap recovery。调用前MUST展示run、冻结Candidate/generation与Content Target、source commit、retained-writer边界、将创建或复用的capsule、候选provider并非sandbox以及恢复限制，并MUST取得用户对该run的单独明确授权。

#### Scenario: 观察到合格retained provider defect

- **WHEN** retained Result闭合支持的failure predicate且repair checkout满足authority条件
- **THEN** Skill MUST说明retained Application/repository/state machine仍是canonical owner
- **AND** MUST说明ES module会执行受验证provider模块及其本地依赖闭包，而不是只执行一个导出函数
- **AND** MUST等待用户明确授权后才增加`--bootstrap-recovery`

#### Scenario: 同一run后续blocked恢复

- **WHEN** 已授权bootstrap run在provider authority仍有效时进入普通blocked phase
- **THEN** Skill MUST复用同一run、capsule与current Product resume token
- **AND** MUST NOT创建新Candidate、Verification、Review、handoff或递归修复Task

#### Scenario: provider authority撤销后的terminal恢复

- **WHEN** capsule revocation已证明authority撤销且只剩terminal persistence未完成
- **THEN** Skill MUST使用产品返回的same-run retained-only resume动作
- **AND** MUST NOT尝试恢复、重建或重新加载capsule

#### Scenario: 恢复不合格

- **WHEN** failure evidence不完整、origin/phase不支持、已有副作用、authority漂移或故障位于CLI/registry/Application/repository/migration层
- **THEN** Skill MUST保留普通Finish blocker并停止
- **AND** MUST NOT推断临时runtime、tarball、source path、alternate writer或人工Git旁路
