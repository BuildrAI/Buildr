## ADDED Requirements

### Requirement: Task Verification Skill必须指导Agent直接验证并形成报告
Package MUST投射Task Verification Skill，指导Agent探查项目测试体系、读取v4测试地图、结合Task与当前改动选择具体测试，并直接使用Maven、npm、Playwright、Browser、HTTP或项目runner。Skill MUST区分开发反馈与开发完成验证；只有后者调用Task Verification record。

#### Scenario: 开发过程中运行测试
- **WHEN** Agent为当前修改运行focused单元或功能测试
- **THEN** Skill MUST指导Agent修复失败并继续开发
- **AND** MUST NOT记录Task Verification Report

#### Scenario: 开发完成
- **WHEN** Agent认为实现完成并准备验证
- **THEN** Skill MUST指导Agent执行任务相关测试、相关服务低成本完整回归和适用环境冒烟
- **AND** 形成包含选择理由、实际targets、结果、gaps和结论的报告后调用record

### Requirement: Task Development Skill不得编排Task Verification
Task Development Skill MUST NOT要求Task Verification capability、Formal Plan、formal run、reconcile、verification policy、Candidate lease或Verification gate。它 MAY提醒Agent按独立Task Verification Skill完成开发后验证，但MUST不把报告设为Development前置。

#### Scenario: Development继续工作
- **WHEN** Task Verification报告缺失或stale
- **THEN** Task Development Skill MUST继续依据自身事实指导合法研发动作
- **AND** MUST不要求先恢复Task Verification流程
