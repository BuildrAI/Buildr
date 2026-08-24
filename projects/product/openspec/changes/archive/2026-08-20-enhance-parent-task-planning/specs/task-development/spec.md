## ADDED Requirements

### Requirement: Development Parent Plan 必须兼容 v1 并以 v2 作为 current writer schema
Task Development MUST 在同一 `task_development_current.record_json` authority 中 dual-read Parent Plan v1/v2，新建或 reconcile Parent Plan MUST 只保存 v2；Receipt/table schema MUST NOT 因 Parent Plan v2 增加新表、migration、backfill 或第二 writer。

#### Scenario: v1 Receipt current 读取
- **WHEN** current Development Receipt 包含合法 v1 Parent Plan
- **THEN** Development inspect MUST 保持 Receipt current 并允许 Parent coordination dual-read
- **AND** MUST NOT 因 schema 较旧自动改写 Receipt

#### Scenario: v2 Plan 内容变化
- **WHEN** v2 的 priority、title、objective、directions、boundaries、expected Child、dependencies、architecture decisions 或 final acceptance 改变
- **THEN** Development planning target MUST 改为新 Plan identity
- **AND** 旧 planning gate、Candidate 与 handoff MUST 按既有 applicability 规则失效

