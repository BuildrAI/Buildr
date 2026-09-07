## ADDED Requirements

### Requirement: Task轻量查询必须组合本机复盘文档摘要
Task列表与详情read model MUST直接返回Task Record拥有的可空复盘摘要和固定派生文档路径，不得读取Markdown正文、扫描文件系统或维护第二份状态。

#### Scenario: 列出等待人决定的Task
- **WHEN** Task query读取`pending-decision`记录
- **THEN** read model MUST返回登记摘要、状态和派生路径
- **AND** 文档正文与实际currentness MUST只在单Task文档读取时检查

## MODIFIED Requirements

### Requirement: Task Overview 与专业 inspect 必须只计算当前owner保存值
Task Overview、Review、Verification和Parent inspect以及Buildr Web GET MUST只读取所属Application允许的值。复盘文档单项读取 MUST只读取固定本机Markdown和Task Record登记摘要，不执行Git、恢复、Agent调用或数据库mutation。

#### Scenario: 读取没有专业结果的Task
- **WHEN** Task仅存在Task Record
- **THEN** Overview MUST返回目标、状态与专业空态，复盘卡片显示未登记
- **AND** MUST不恢复旧研发、Environment、Retrospective current或收尾数据

## REMOVED Requirements

### Requirement: Task 轻量查询必须组合复盘来源关系
**Reason**: 专用来源关系整体删除。
**Migration**: 后续目标使用普通Task说明；read model只返回Task-owned复盘文档摘要。
