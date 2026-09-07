## ADDED Requirements

### Requirement: Buildr Web Task Verification Agent action不得依赖后端prompt
Buildr Web MUST在前端形成携带Task ID的最小指令，要求Agent读取Task Verification Skill与真实现场。前端 MUST不调用、声明或依赖Verification prompt API；后端不存在该route。

#### Scenario: 用户交给Agent验证
- **WHEN** 用户在证据页发起Task Verification Agent action
- **THEN** 前端 MUST生成短指令且不修改Verification Report
- **AND** Agent自行选择并调用已有测试工具
