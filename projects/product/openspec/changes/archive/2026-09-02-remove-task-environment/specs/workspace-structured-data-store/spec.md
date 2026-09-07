## ADDED Requirements

### Requirement: Task Environment current必须一次删除

Workspace SQLite MUST通过单一连续migration删除`task_environment_current`及其index。Migration MUST不复制旧rows、不创建history/backup表、不保留view或双读入口；Task、Review、Verification、Retrospective和其他current tables MUST保持不变。

#### Scenario: 升级含旧Environment数据的Workspace
- **WHEN** migration应用到包含任意`task_environment_current`rows的数据库
- **THEN** table和rows MUST被直接删除
- **AND** 其他Task专业记录 MUST保持可读

#### Scenario: 新Workspace建库
- **WHEN** 全部migration从空库顺序执行
- **THEN** 最终schema MUST不包含`task_environment_current`及其index

## REMOVED Requirements

### Requirement: Environment current 必须使用独立窄 SQLite schema
**Reason**: Environment current及其Application已删除。

### Requirement: Receipt v5必须继续使用唯一Environment current slot
**Reason**: 不保留旧Receipt兼容或current slot。
