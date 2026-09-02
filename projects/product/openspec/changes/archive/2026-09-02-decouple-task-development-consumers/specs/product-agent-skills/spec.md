## MODIFIED Requirements

### Requirement: Task Skills 必须解释协调与专业 authority 边界
Buildr package MUST更新Task Manager、Triage、Development、Review、Verification、OpenSpec与Finish Skills，使Agent根据用户目标和当前事实直接发现专业owner。Skills MUST NOT要求`task next`、Candidate、Handoff或Development current作为Review、Verification、Parent管理、OpenSpec apply或Finish的统一前置，也 MUST NOT引导双写、checkbox同步或自动状态传播。

#### Scenario: runtime Agent读取新流程
- **WHEN** 用户要求审查、验证、OpenSpec实现、父子管理或收尾
- **THEN** matching Skill MUST直接读取Task、Environment和本专业所需事实并调用所属Interface
- **AND** MUST不先调用`task next`取得统一流程许可

#### Scenario: 专业provider不可用
- **WHEN** 某一专业Skill的required provider unavailable
- **THEN** MUST只阻止该专业动作并保留其他已确认事实
- **AND** MUST不把整个Task或Workspace标记为blocked
