## ADDED Requirements

### Requirement: self-bootstrap 候选验收必须证明 canonical store 未受污染
Buildr package/runtime verification MUST 覆盖 self-bootstrap candidate 对 canonical Structured Store 的 provenance rejection、独立 validation store migration、CLI/HTTP/internal driver writer routing 与候选 Local App smoke。验证 MUST 证明拒绝路径零 mutation，并明确区分 candidate validation evidence 与 retained runtime activation evidence。

#### Scenario: package fixture 运行 candidate migration
- **WHEN** verifier 用 task worktree candidate runtime 分别指向 canonical Workspace 与 receipt-bound Task Validation Workspace
- **THEN** canonical target MUST 被拒绝并保持数据库 bytes/ledger 不变
- **AND** validation target MUST 能从空库连续应用 candidate migration 并运行受影响测试

#### Scenario: 候选集成后激活
- **WHEN** 最终候选完成 required verification 并进入 retained checkout
- **THEN** activation/Doctor MUST 由 retained source 运行并报告 retained runtime identity
- **AND** MUST NOT 把 candidate validation database 或其数据当作 canonical activation result
