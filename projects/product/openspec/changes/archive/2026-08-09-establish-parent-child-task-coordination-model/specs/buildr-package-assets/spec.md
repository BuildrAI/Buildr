## ADDED Requirements

### Requirement: Package 必须原子交付 Parent coordination 能力
Buildr package MUST原子交付Domain/Application、Development Receipt major兼容、CLI/HTTP/public JSON、Local App build、Skills/contracts/bindings与专项验证；任一schema、registry、source/package/runtime parity或Application接线不一致 MUST fail closed。

#### Scenario: package source parity
- **WHEN** package verifier检查Parent coordination资产
- **THEN** source、package target与runtime投射identity MUST一致
- **AND** CLI与Local App MUST绑定同一Application

### Requirement: Package验证必须拒绝重复authority
Package verification MUST拒绝新增Parent lifecycle/progress/event/history/audit表、`tasks`任意JSON/Child status array、GET filesystem scan、历史backfill/single-Task migration和Parent/Child相同delta双重owner。

#### Scenario: 静态与动态禁止项检查
- **WHEN** candidate包含SQLite migrations、repositories、HTTP readers或Skill流程变化
- **THEN** verifier MUST证明没有被禁止的store/writer/read fallback
- **AND** fresh Workspace与连续upgrade MUST保持旧Task absent-compatible
