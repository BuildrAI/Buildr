## ADDED Requirements

### Requirement: Task Development writer 必须声明portable Receipt path并保持Candidate分离
Task Development writer MUST声明 `buildr.task-development/v1`唯一拥有 `.buildr/tasks/<task-id>/development.yml`，该current Receipt为可选、portable publication eligible；Task Candidate、delivery source、task worktree、runtime与session MUST NOT因该声明成为publication内容。

#### Scenario: Development Receipt存在
- **WHEN** writer可安全读取当前 `development.yml`
- **THEN** publication scope MUST只纳入该exact path
- **AND** metadata commit MUST与Candidate/delivery commit分离

#### Scenario: publication失败
- **WHEN** snapshot、commit或push失败
- **THEN** Development writer MUST保持generation、Candidate、gates、decision与handoffs不变
