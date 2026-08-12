## ADDED Requirements

### Requirement: Task Verification writer 必须声明 portable publication path
Task Verification writer MUST声明 `buildr.task-verification/v3`唯一拥有 `.buildr/tasks/<task-id>/verification.yml`，该current Result为可选、portable publication eligible；transient execution evidence、log、resource、Environment与runtime状态 MUST NOT进入该声明。

#### Scenario: Verification Result存在
- **WHEN** writer可安全读取当前 `verification.yml`
- **THEN** publication scope MUST只纳入该exact path及其当前bytes

#### Scenario: Verification Result缺失
- **WHEN** current Result不存在
- **THEN** publication MUST保持路径缺失且不得从transient evidence重建Result
