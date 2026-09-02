## MODIFIED Requirements

### Requirement: 长流程 compact summary 必须登记并受自动覆盖保护
Buildr MUST在公共JSON registry、CLI help、schema validation与checkout/npm parity中登记`buildr.long-running-operation-summary/v1`，并保护self-bootstrap、formal Verification与release transaction的compact/full边界。Registry MUST不再包含Retrospective list或operation result。

#### Scenario: compact schema 漂移
- **WHEN** 长流程缺少summary schema或关键边界
- **THEN** Product verification MUST失败

#### Scenario: compact 泄漏完整专业事实
- **WHEN** compact payload泄漏完整证据、日志、路径或secret
- **THEN** schema verification MUST失败

#### Scenario: explicit full保持owner identity
- **WHEN** 调用方显式请求full
- **THEN** CLI MUST返回owner既有full schema
- **AND** MUST不写入新的durable Result
