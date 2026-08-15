## ADDED Requirements

### Requirement: Task Entry Snapshot CLI 必须提供稳定公开 JSON identity
`buildr task next <task-id> --json` MUST输出closed `buildr.task-entry-snapshot/v1`，至少包含operation、status、task、environment、development、blockers、`next`、diagnostic、effects，并 MAY包含显式请求的response-only profile。payload MUST不包含完整Receipt/Result、SQLite locator、resource handle、完整capability graph或隐藏Agent状态。

#### Scenario: compact snapshot 成功
- **WHEN** checkout或npm tarball CLI读取有效active Task
- **THEN** stdout MUST是单一有效JSON对象且stderr为空
- **AND** 两种发行形态 MUST保持schema、关键字段与退出语义parity

#### Scenario: snapshot blocked
- **WHEN** Task不存在或terminal、Environment/Development identity stale、execution target mismatch或capability route不可用
- **THEN** stdout MUST仍返回同一schema的blocked object并以非零状态退出
- **AND** effects MUST为空且diagnostic MUST包含精确code、owner与recovery action

#### Scenario: profile 未请求
- **WHEN** 调用方未提供`--profile`
- **THEN** payload MUST不包含profile
- **AND** 不得从其他持久化事实推断或回填历史性能数据

### Requirement: Task Entry Snapshot JSON registry 必须与 command registry 同步
Public JSON registry、command registry、help、schema guard与checkout/npm parity MUST同时登记Task Entry Snapshot；任一 surface 可达但coverage缺失时package/static verification MUST fail closed。

#### Scenario: registry 漂移
- **WHEN** `task next`已登记但`buildr.task-entry-snapshot/v1`、关键字段guard或parity fixture缺失
- **THEN** 产品验证 MUST失败并指出缺失identity
