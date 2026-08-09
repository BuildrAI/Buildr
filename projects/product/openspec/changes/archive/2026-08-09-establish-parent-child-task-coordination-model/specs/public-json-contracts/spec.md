## ADDED Requirements

### Requirement: Parent coordination JSON 必须closed且登记
Buildr MUST登记Parent Plan、Contribution binding、Contribution Handoff、coordination inspect/mutation Result的stable public JSON identities；响应 MUST不暴露SQLite path或本机绝对路径。

#### Scenario: inspect public JSON
- **WHEN** client请求Parent coordination read model
- **THEN** response MUST包含schemaVersion、Parent Plan identity、Child/Contribution facts、prerequisites、diagnostics与零effects
- **AND** public registry MUST拒绝未登记或开放payload字段

### Requirement: legacy absence 必须是明确contract
没有Parent Plan或Contribution Handoff MUST以closed absent/legacy状态表达，不得用缺字段异常、filesystem fallback或自动upgrade掩盖。

#### Scenario: 旧Task JSON
- **WHEN** inspect读取旧Task/Receipt
- **THEN** response MUST返回legacy mode与可操作diagnostic
- **AND** MUST保持原Task read model兼容
