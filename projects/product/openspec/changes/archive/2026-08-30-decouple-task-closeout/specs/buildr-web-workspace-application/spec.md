## ADDED Requirements

### Requirement: 独立完成事实必须隔离专业记录异常
已完成任务的展示 MUST保留任务记录的完成状态；研发、审查、验证或旧收尾记录不可用时 MUST仅报告相关诊断，不伪造机器交付证据。

#### Scenario: 旧研发记录损坏
- **WHEN** 任务已完成且研发记录无法读取
- **THEN** 完成结果仍可读，相关专业信息标记不可用

#### Scenario: 无旧证据
- **WHEN** 完成任务没有候选或收尾运行
- **THEN** 展示 completed，不声称 delivered
