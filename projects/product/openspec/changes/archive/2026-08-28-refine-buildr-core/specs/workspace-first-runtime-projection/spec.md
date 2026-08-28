## MODIFIED Requirements

### Requirement: Buildr Core 要求简明表达
Buildr 必读核心规则（required Core）MUST 要求智能体（Agent）面向用户说明或回复产品设计、实现、问题、方案、进度或结果时，使用直接、简练、易于理解的表达；专业术语每次出现都使用统一的中英文对照，并准确处理必须对应实现的文本和有助于降低理解歧义的 Mermaid 可视化。

#### Scenario: Agent 说明方案或结果
- **WHEN** 智能体面向用户说明或回复产品设计、实现、问题、方案、进度或结果
- **THEN** 智能体 MUST 优先使用用户容易理解的直接、简练表达
- **AND** 智能体 MUST 只在准确表达所必需时使用专业术语

#### Scenario: 专业术语只使用中文
- **WHEN** 智能体准备只用中文名称或中文释义表达专业术语
- **THEN** 智能体 MUST 同时提供对应英文原词
- **AND** 智能体 MUST 使用“中文（English Term）”形式
- **AND** 智能体 MUST NOT 单独使用中文专业术语
- **AND** 同一描述范围内 MUST 保持中文名称、英文原词和概念边界一致

#### Scenario: 已有中文名称的专业术语首次出现
- **WHEN** 智能体在面向用户的说明或回复中首次使用已有中文名称的专业术语
- **THEN** 智能体 MUST 同时提供对应中文名称或中文含义和英文原词
- **AND** 智能体 MUST 使用“中文（English Term）”形式
- **AND** 智能体 MUST NOT 单独使用中文或英文专业术语

#### Scenario: 英文专业术语后续再次出现
- **WHEN** 智能体在同一说明或回复中再次使用已经解释过的专业术语
- **THEN** 智能体 MUST 再次使用“中文（English Term）”形式
- **AND** 智能体 MUST NOT 因该术语此前已经解释而省略中文名称或英文原词

#### Scenario: 专业术语没有稳定中文译名
- **WHEN** 面向用户的英文专业术语没有稳定中文译名
- **THEN** 智能体 MUST 使用能够说明其含义的准确中文表述
- **AND** 智能体 MUST 使用“中文释义（English Term）”形式，不得省略中文释义或英文原词

#### Scenario: 文本必须精确对应实现
- **WHEN** 命令、代码标识、字段名、接口名、文件路径、错误原文、产品专名或其他文本必须与实现精确对应
- **THEN** 智能体 MUST 保留需要精确对应的英文原文
- **AND** 智能体将该文本作为专业概念向用户说明时 MUST 使用“中文（English Term）”或“中文释义（English Term）”形式
- **AND** 用户可见标签或说明 MUST NOT 使用英文原文代替中文或中英文并列的专业称谓

#### Scenario: 复杂关系适合图示
- **WHEN** 输出环境支持 Mermaid，且关系、时序、分支或状态转换用文字不易准确理解
- **THEN** 智能体 MUST 使用 Mermaid 表达该结构
- **AND** 智能体 MUST 用一句话说明图表的关键结论

#### Scenario: 简单线性内容不需要图示
- **WHEN** 内容可以用简短文字或表格准确表达
- **THEN** 智能体 MUST 使用文字或表格
- **AND** 智能体 MUST NOT 仅为展示形式而增加 Mermaid 图表
