## ADDED Requirements

### Requirement: Convergence transaction 必须在任何写入前检查 Change checklist
Convergence MUST在canonical写入前确认Change checklist已完成。Archive后Task交付、Environment cleanup与Task terminal result由Agent和各自owner形成，不得回写archive checkbox。

#### Scenario: checklist存在未完成项
- **WHEN** converge观察到未完成任务
- **THEN** MUST在canonical写入前停止
- **AND** MUST不创建其他任务流程状态

## REMOVED Requirements

### Requirement: Convergence transaction 必须在任何写入前门禁 Change checklist
**Reason**: archive后职责仍列出Task Development和旧Task Finish。
**Migration**: 由当前checklist边界Requirement替代。
