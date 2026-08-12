## ADDED Requirements

### Requirement: Parent coordination 接口必须共享同一 Application
CLI与Local App MUST调用同一Parent Coordination Application执行inspect、record、reconcile与final acceptance actions；interface MUST NOT直接查询SQLite、扫描文件系统或在GET中回填状态。

#### Scenario: CLI 与 HTTP 读取同一 Parent
- **WHEN** 两个client读取同一Parent identity
- **THEN** 两者 MUST返回相同Parent Plan、Child Contribution与prerequisite facts
- **AND** GET MUST保持零mutation effects

### Requirement: mutation 必须使用 current identity 并受界面安全保护
Parent Plan reconciliation与final acceptance mutation MUST使用expected current identity；Local App HTTP MUST另外执行same-origin、session与closed JSON校验。

#### Scenario: 陈旧页面提交reconciliation
- **WHEN** expected Parent Plan identity与current不一致
- **THEN** Application MUST返回conflict且零写入
- **AND** client MUST刷新current read model后再决定
