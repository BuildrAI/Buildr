## MODIFIED Requirements

### Requirement: Task Skills 必须解释协调与专业 authority 边界
`task-review` Skill MUST指导Agent从用户目标、Task、真实subject和专业owner事实动态选择Planning或Completion审查，先inspect current slot，再使用现有代码/Git/文件/测试/Browser/HTTP/外部工具完成审查，最后以CAS record完整Result。Skill MUST不要求Environment、Development、Candidate、Handoff或统一gate；目标不明或审查中断时不得写Result。

#### Scenario: Agent审查普通代码修改
- **WHEN** 用户要求审查一个没有Development的服务修复Task
- **THEN** Agent MUST读取Task与真实diff、相关测试和Service规则形成subject identity及Review Result
- **AND** MUST不要求补造OpenSpec、Candidate或Development Receipt

#### Scenario: runtime Agent读取新流程
- **WHEN** runtime Agent命中Task Review意图
- **THEN** MUST读取投射后的Task Review Skill并直接检查Task、current slot和真实subject
- **AND** MUST不读取`task next`或要求Development provider

#### Scenario: 专业provider不可用
- **WHEN** Task Review provider未绑定或不可用
- **THEN** Agent MUST报告Review动作不可执行且不写Result
- **AND** MUST不阻塞其他不依赖Review的Task工作
