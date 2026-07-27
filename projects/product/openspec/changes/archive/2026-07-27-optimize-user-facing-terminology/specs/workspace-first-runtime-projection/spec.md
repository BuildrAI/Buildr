## MODIFIED Requirements

### Requirement: Buildr Core 要求简明表达
Buildr required Core MUST 要求 Agent 面向用户说明产品设计、实现、问题、方案、进度或结果时，使用直接、简练的中文，并按统一规则表达中英文专业术语与必须精确对应实现的文本。

#### Scenario: Agent 说明方案或结果
- **WHEN** Agent 向用户说明产品设计、实现、问题、方案、进度或结果
- **THEN** Agent MUST 优先使用用户容易理解的直接、简练中文
- **AND** Agent MUST 只在准确表达所必需时使用专业术语

#### Scenario: 已有中文名称的专业术语首次出现
- **WHEN** 面向用户的专业术语已有正式或稳定的中文名称并在当前描述范围内首次出现
- **THEN** Agent MUST 使用“中文（English Term）”形式
- **AND** 后续内容 MUST 优先使用中文名称
- **AND** 同一描述范围内 MUST 保持术语译法一致

#### Scenario: 专业术语没有稳定中文译名
- **WHEN** 面向用户的专业术语没有稳定中文译名
- **THEN** Agent MAY 保留英文术语
- **AND** Agent MUST 在该术语首次出现时说明其含义

#### Scenario: 文本必须精确对应实现
- **WHEN** 命令、代码标识、字段名、接口名、文件路径、错误原文或其他文本必须与实现精确对应
- **THEN** Agent MUST 保留其英文原文
- **AND** Agent SHOULD 在有助于用户理解时补充简明中文说明
