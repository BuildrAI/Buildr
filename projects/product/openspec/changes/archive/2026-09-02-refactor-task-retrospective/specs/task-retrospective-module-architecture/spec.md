## ADDED Requirements

### Requirement: Buildr不得提供独立Task Retrospective模块
Buildr MUST不提供Task Retrospective Domain、Application、Repository、module descriptor、runtime port、内部Driver、HTTP处置adapter或SQLite current writer。Task Record MUST只维护本机复盘文档摘要和人的决定状态，Agent MUST通过纯Skill生成正文。

#### Scenario: 创建Bootstrap runtime
- **WHEN** Buildr组装Task模块与HTTP贡献
- **THEN** module registry MUST不存在`task-retrospective` descriptor、port或writer
- **AND** Task Record、Review、Verification与Parent能力 MUST继续独立可用

#### Scenario: 检查退役路径
- **WHEN** package或架构验证扫描生产源码
- **THEN** 旧Retrospective实现、Driver、内部route和HTTP处置路径 MUST不存在

## REMOVED Requirements

### Requirement: Task Retrospective 必须归属 Task 模块的明确技术分层
**Reason**: 独立模块整体退役。
**Migration**: 删除全部技术层实现，不迁移到新目录。

### Requirement: Task Retrospective 必须通过窄模块入口唯一装配
**Reason**: 不再装配独立模块。
**Migration**: Bootstrap只装配Task Record的本机文档能力。

### Requirement: Task Retrospective 模块端口必须保持唯一 writer authority
**Reason**: 专用writer删除。
**Migration**: Task Record是摘要与决定状态唯一writer；正文由Agent写固定文件。

### Requirement: 迁移必须保持 Task Retrospective 行为与存储等价
**Reason**: 用户明确选择破坏性简化并删除旧数据。
**Migration**: 不保持旧报告、三态、接口或存储等价。
