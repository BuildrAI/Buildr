## REMOVED Requirements

### Requirement: Agent 必须从同一 Execution Record 恢复正式验证运行状态
**Reason**: 通用Task Execution Record已退役。
**Migration**: Task Verification只保存当前报告；长流程恢复由具体owner负责。

### Requirement: Agent必须按release身份链消费专业provider
**Reason**: 条款仍把Task Environment、Development、Finish和Contribution Handoff列为current release owner。
**Migration**: release专属规范直接组合Task、Preparation、Worktree、Candidate、Git与平台owner。
