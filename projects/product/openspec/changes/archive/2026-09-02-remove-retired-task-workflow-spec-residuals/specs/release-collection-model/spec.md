## ADDED Requirements

### Requirement: 发布身份链必须只组合当前发布与任务owner事实
Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publication dev provenance reconciliation → transaction evidence`作为唯一发布身份链。Task correlation MUST只组合release/support Task Record关系、适用Task Environment、真实Git/remote和当前发布owner事实。

#### Scenario: 构造发布任务关联
- **WHEN** release transaction读取Task correlation
- **THEN** MUST不要求Task Development、Task Candidate、Development Handoff、旧Task Finish或self-bootstrap结果
- **AND** Product Candidate source、generation、CI aggregate与唯一tarball MUST保持不变

## REMOVED Requirements

### Requirement: 发布身份链必须只组合current owner facts
**Reason**: Task correlation仍把self-bootstrap列为输入。
**Migration**: 只组合Task Record、Environment、Git/remote与发布owner事实。
