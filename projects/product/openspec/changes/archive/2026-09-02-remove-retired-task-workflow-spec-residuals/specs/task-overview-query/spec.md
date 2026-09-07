## ADDED Requirements

### Requirement: Task Overview 与专业 inspect 必须只计算当前owner保存值
Task Overview、Review、Verification、Environment、Retrospective和Parent inspect以及Buildr Web GET MUST只读取所属Application允许的已保存值。它们 MUST不执行Git observation、Environment probe、filesystem recovery或数据库mutation。

#### Scenario: 读取没有专业结果的Task
- **WHEN** Task仅存在Task Record
- **THEN** Overview MUST返回目标、状态与专业空态
- **AND** MUST不恢复旧研发或收尾数据

## REMOVED Requirements

### Requirement: Task Overview 与专业 inspect 必须只计算无副作用保存值关系
**Reason**: consumer清单与禁止项仍包含已退役Application行为。
**Migration**: 只列出当前owner和真实只读边界。
