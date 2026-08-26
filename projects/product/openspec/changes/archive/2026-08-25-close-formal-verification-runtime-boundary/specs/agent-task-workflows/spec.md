## ADDED Requirements

### Requirement: Agent 必须从同一 Execution Record 恢复正式验证运行状态
Task Verification Skill与Agent workflow MUST把running progress、timed-out、cancelled与cleanup failure视为同一formal invocation的Execution Record事实。Agent MUST先inspect该record并消费其recovery；除非用户或当前owner明确选择`--retry`，不得因stdout丢失、等待超时或progress heartbeat陈旧启动替代run。

#### Scenario: formal Verification仍在运行
- **WHEN** matching invocation返回open record与current progress
- **THEN** Agent MUST报告当前capability、phase、最后heartbeat与record inspect入口并等待或继续只读inspect
- **AND** MUST不启动第二份capability execution

#### Scenario: capability timed out并已terminal
- **WHEN** record terminal summary显示timed-out且owned cleanup已完成
- **THEN** Agent MUST报告timeout capability、deadline、cleanup与显式retry入口
- **AND** MUST不把timeout描述为人工取消、unknown或自动重试成功

#### Scenario: cancellation或cleanup failure
- **WHEN** record显示cancelled或process cleanup failure
- **THEN** Agent MUST分别报告已取消事实或剩余owned process诊断，并按同一owner next action恢复
- **AND** MUST不按端口、进程名或Workspace文本自行清理进程

#### Scenario: progress存在但producer失联
- **WHEN** open record只有last progress且没有可验证terminal summary
- **THEN** Agent MUST把progress作为最后观察事实并使用existing recover/unknown流程
- **AND** MUST不从heartbeat时间推断terminal outcome或Verification Result
