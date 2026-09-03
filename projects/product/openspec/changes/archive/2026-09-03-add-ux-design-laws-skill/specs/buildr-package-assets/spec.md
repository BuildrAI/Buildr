## ADDED Requirements

### Requirement: Buildr package 必须发布用户体验设计法则内置技能
Buildr package manifest MUST 将 `ux-design-laws` 声明为无 capability contract 的可选内置 Skill，使用 `resources/workspace/skills/buildr/ux-design-laws` 作为完整源目录、`skills/buildr/ux-design-laws` 作为 Workspace target，并投射到全部受支持的 Agent runtime。

#### Scenario: package 声明用户体验设计法则技能
- **WHEN** Buildr package 加载 builtin Skill manifest
- **THEN** `ux-design-laws` MUST 声明 source path、target、与 Skill frontmatter 完全一致的 description、`required: false` 和全部受支持 runtimes
- **AND** 它 MUST 不声明 `provides`、`requires`、capability contract 或 initial binding

#### Scenario: Workspace baseline 包含完整技能目录
- **WHEN** Buildr 初始化或同步 Workspace 内置资产
- **THEN** Workspace 文件映射 MUST 包含 `ux-design-laws` 的 `SKILL.md`、`agents/openai.yaml`、法则索引和全部五个分组参考文件
- **AND** 随附文件 MUST 保持源目录相对结构并按 package Skill 完整目录规则参与 runtime 投射

#### Scenario: package check 验证用户体验设计法则技能
- **WHEN** Agent 运行 Buildr package check 或对应内置技能契约测试
- **THEN** 验证 MUST 确认 manifest/source/target/description/runtime 一致、30 个主题完整、参考文件可达且没有未完成脚手架
- **AND** 验证 MUST 确认 `ux-design-laws` 不生成原型、不修改代码、不依赖 `ui-prototype` capability，并保留心理学法则的证据、验证和非操纵性边界
