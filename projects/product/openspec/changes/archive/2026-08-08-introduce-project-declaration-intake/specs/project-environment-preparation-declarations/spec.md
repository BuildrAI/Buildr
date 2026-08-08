# project-environment-preparation-declarations Delta

## ADDED Requirements

### Requirement: Preparation缺口必须提供Declaration Intake恢复入口
当Environment Plan Request选择Project declaration但声明缺失、无效或Recipe不匹配时，Task Environment MUST fail closed并返回指向Declaration Intake的next action。`inspect` MUST保持只读且 MUST不运行Intake或写声明。

#### Scenario: 声明缺失
- **WHEN** `prepare`选择`project-declaration`但Project没有`preparation.yml`
- **THEN** Environment MUST blocked并指出Project与声明路径
- **AND** next action MUST让Agent只读发现候选并在用户授权后由`task-environment`维护声明

#### Scenario: Recipe缺失
- **WHEN** Plan Request引用当前声明中不存在的Recipe
- **THEN** Environment MUST blocked并指出scope与Recipe id
- **AND** MUST不扫描其他package roots或自动更新声明
