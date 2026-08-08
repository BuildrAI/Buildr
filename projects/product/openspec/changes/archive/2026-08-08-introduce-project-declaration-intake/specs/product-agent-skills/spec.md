# product-agent-skills Delta

## ADDED Requirements

### Requirement: Package必须投射Declaration Intake Skill
Buildr package MUST提供`declaration-intake` workspace Skill，description MUST覆盖声明初始化、刷新及自动触发缺口。Skill MUST声明只读发现、用户授权与owner handoff，并 MUST不成为Preparation或Verification capability provider。

#### Scenario: 授权Preparation写入
- **WHEN** Intake取得`preparation.yml`精确diff授权
- **THEN** Agent MUST进入`task-environment` owner流程维护声明
- **AND** Intake Skill MUST不直接执行Preparation Step

#### Scenario: 授权Verification写入
- **WHEN** Intake取得`verification.yml`精确diff授权
- **THEN** Agent MUST进入`task-verification` owner流程维护声明
- **AND** Intake Skill MUST不执行或开发验证能力
