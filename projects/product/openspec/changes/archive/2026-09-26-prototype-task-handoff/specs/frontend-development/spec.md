## ADDED Requirements

### Requirement: 正式前端实施必须接续讨论阶段的原型
用户决定实施且已有未被明确忽略的原型时，前端开发技能（Frontend Development Skill）MUST 在正式编辑前核对原型的确认版本与保存位置，尚未归入任务时 MUST 接续原型技能（UI Prototype Skill）的归入流程；MUST NOT 仅因文件可打开而视为任务内可发现，也不得重新询问是否制作原型。

#### Scenario: 从临时预览继续实施
- **WHEN** 用户说按已有临时原型实施
- **THEN** 智能体（Agent）MUST 先按原型技能核对并保全成果、报告任务展示结果，再依据确认设计实施

#### Scenario: 没有原型的普通修复
- **WHEN** 已明确的局部修复没有原型
- **THEN** 智能体（Agent）MUST 继续直接实施，不额外制作原型或建立归入记录
