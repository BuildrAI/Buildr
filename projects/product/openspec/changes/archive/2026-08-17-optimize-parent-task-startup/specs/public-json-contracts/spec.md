## ADDED Requirements

### Requirement: Parent启动就绪与refresh结果必须登记公开JSON identity
Buildr MUST为Parent启动就绪投影和planning refresh operation登记closed public JSON shape，并在Application、CLI、schema registry、contract guard与checkout/npm parity中保持一致；payload MUST不暴露Review正文、完整Development Receipt、SQLite locator或本机绝对路径。

#### Scenario: Parent启动就绪JSON parity
- **WHEN** checkout与npm package读取同一Parent启动事实
- **THEN** 两者 MUST返回相同schema identity、status、checks、blockers、eligible Contributions与next语义
- **AND** effects MUST为空

#### Scenario: Parent refresh JSON parity
- **WHEN** checkout与npm package对满足条件的Parent执行planning refresh
- **THEN** 两者 MUST返回相同operation status、Plan/Review applicability、Development effect摘要与后续启动就绪语义
- **AND** 任一surface缺少registry或关键字段guard时package verification MUST失败
