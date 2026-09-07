## ADDED Requirements

### Requirement: UI相关工作必须由实际入口询问原型并默认遵循已有原型
Task Triage与Buildr OpenSpec propose、update、apply contributions MUST在当前任务可能改变前端UI时询问用户是否需要UI Prototype，并只在明确确认后路由selected provider。已有原型时Agent MUST默认按其信息架构、布局和交互开发，除非用户明确要求忽略。

#### Scenario: 用户不需要原型
- **WHEN** 用户明确拒绝本次UI Prototype
- **THEN** Agent MUST继续当前Task或OpenSpec工作
- **AND** MUST不创建原型状态或流程门禁

## REMOVED Requirements

### Requirement: UI 相关研发流程必须路由原型并默认遵循已有原型
**Reason**: 调用方和后续阶段仍包含Task Development。
**Migration**: 由当前实际入口直接路由可选原型。
