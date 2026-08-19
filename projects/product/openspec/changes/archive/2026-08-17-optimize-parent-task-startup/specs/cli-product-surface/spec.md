## ADDED Requirements

### Requirement: Parent Coordination CLI必须公开planning refresh
Buildr CLI MUST公开`task parent refresh-planning <task-id>`，并只接收Task identity、canonical target与输出模式；该命令MUST不接收planning JSON、Review digest、gate正文或Child状态。

#### Scenario: 查看refresh帮助
- **WHEN** 用户运行Parent Coordination topic help或`task parent refresh-planning --help`
- **THEN** help MUST展示命令用途、必需Task ID和canonical target
- **AND** MUST明确该动作消费saved Parent Plan与current Planning Review

#### Scenario: candidate CLI尝试写canonical Workspace
- **WHEN** refresh由Task worktree candidate CLI指向retained canonical Workspace
- **THEN** writer provenance guard MUST保持零写入并返回retained controller route
- **AND** CLI MUST不绕过Development writer authority

### Requirement: Parent Plan CLI必须提供输入discoverability
Parent Plan record/reconcile CLI MUST为closed输入提供机器可读schema与example发现方式，并与实际Application validation保持同步。

#### Scenario: Agent发现Parent Plan输入
- **WHEN** Agent请求Parent Plan record或reconcile的schema/example
- **THEN** CLI MUST返回outcome、architectureInvariants、contributions、dependencies与finalAcceptance的closed shape及最小合法样例
- **AND** Agent MUST不需要读取产品源码、测试或SQLite来构造输入
