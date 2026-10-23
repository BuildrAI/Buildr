# agent-task-workflows Delta Spec

## ADDED Requirements

### Requirement: 任务收尾指引处置已登记产物

`task-finish` 技能（Skill）指引 MUST 要求智能体（Agent）在收尾时处置当前任务已登记的产物（Artifact）：核验每项登记归属与处置策略，`ephemeral` 且已失效的经 `buildr artifact clean` 或所属工具清理，仍需保留的经 `buildr artifact release` 或登记更新转为 `retained` 并写明引用方与保留理由，归属或安全无法证明的保留现场并报告具体差异。该处置 MUST 作为指引执行并与验证、Git 交付并列报告结果；产物处置缺口 MUST NOT 替代已成立的交付事实，也不成为统一收尾门禁。

#### Scenario: 收尾发现本任务临时产物

- **WHEN** 任务完成时其登记产物中存在 `ephemeral` 且任务已终态
- **THEN** 指引 MUST 要求 Agent 核验归属后清理或明确保留原因
- **AND** 清理结果 MUST 列入收尾报告中的资源处置事实

#### Scenario: 登记产物仍需保留

- **WHEN** 某登记产物仍被运行应用或后续工作引用
- **THEN** 指引 MUST 要求显式转为 `retained` 并记录引用方
- **AND** MUST NOT 因该产物存在而否定已交付成果
