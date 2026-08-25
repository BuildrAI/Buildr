## ADDED Requirements

### Requirement: 长流程 compact summary 必须登记并受自动覆盖保护
Buildr MUST在公共 JSON registry、CLI help、schema validation与checkout/npm parity中登记 `buildr.long-running-operation-summary/v1`，并 MUST为 self-bootstrap、formal Verification 与 release transaction 的缺省 compact及显式 full路径提供关键字段/禁止字段测试。Retrospective list MUST继续使用自身closed identity并登记新增字节边界字段。

#### Scenario: compact schema 漂移
- **WHEN** 任一受管长流程可达但缺少summary schema、detail help、关键 recovery字段或禁止字段guard
- **THEN** Product verification MUST失败并指出缺失入口

#### Scenario: compact 泄漏完整专业事实
- **WHEN** compact payload包含完整 operations/effects/checks/context/evidence/diagnostics、stdout/stderr、本机locator、raw argv、secret或token
- **THEN** schema/contract verification MUST失败

#### Scenario: explicit full保持owner identity
- **WHEN** 调用方对受管入口显式请求 `--detail full`
- **THEN** CLI MUST返回该 owner 既有 canonical full schema与退出语义
- **AND** MUST不把 compact summary identity写入专业 durable Result或替代其authority
