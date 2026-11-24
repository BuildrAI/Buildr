## MODIFIED Requirements

### Requirement: Agent按需生成本机任务复盘文档
用户明确要求复盘已完成或已放弃Task时，`task-manager` 的按需复盘指南 MUST指导Agent只根据当前可见的Task、Git、代码、测试、专业结果、工具输出和用户事实生成自由Markdown，并写入`.buildr/local/task-retrospectives/<task-id>.md`。正文 MUST NOT进入SQLite、Git、发布物、Current Knowledge或其他专业Result。

#### Scenario: 用户要求复盘终态Task
- **WHEN** 用户明确要求复盘一个`completed`或`abandoned` Task
- **THEN** Agent MUST区分已观察事实、推断和缺失数据并生成本机Markdown
- **AND** 精确耗时或Token不可得时 MUST明确缺失且不得估算、回放隐藏上下文或新增采集

#### Scenario: 用户没有要求复盘
- **WHEN** Task完成或放弃但用户没有要求复盘
- **THEN** Agent与Buildr MUST不生成文档、不写复盘状态且不自动提示
- **AND** 其他Task、Review、Verification、Git、交付和清理行为 MUST正常工作
