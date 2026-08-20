## ADDED Requirements

### Requirement: Agent workflow 必须只使用Parent Coordination v3
Buildr随包Task Skills MUST引导Agent使用v3 canonical字段取得Plan identity、Contribution实施方向、binding、eligible next与最终验收前置条件，MUST不继续引用已删除v2 alias。

#### Scenario: 从Parent启动Child
- **WHEN** Agent读取Parent coordination以选择eligible Contribution
- **THEN** workflow MUST从顶层`contributions`和`startup.next`取得所需事实
- **AND** MUST从`plan.identity`取得current expected identity

#### Scenario: Parent最终验收
- **WHEN** Agent判断是否可执行Parent accept
- **THEN** workflow MUST只使用`prerequisitesSatisfied`与canonical blockers
- **AND** MUST不读取`finalAcceptanceReady`
