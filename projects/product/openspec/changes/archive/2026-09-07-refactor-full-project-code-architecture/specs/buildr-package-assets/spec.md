## MODIFIED Requirements

### Requirement: package manifest 声明产品内置 Agent Skills
Buildr 的 `resources/manifest.yml` MUST显式声明产品随包内置 Agent Skills，并将产品入口 Skill 定义与用户 Workspace `skills/manifest.yml` 分离；其源 MUST位于 `resources/runtime/skills/<skill-id>/` 文件型交付资源树，`package/targets/runtime` MUST不再作为源 authority。

#### Scenario: 声明 agentSkills
- **WHEN** Buildr 产品包包含内置 Agent Skill
- **THEN** `resources/manifest.yml` MUST通过专用字段声明 Skill id、源路径和适用 runtime
- **AND** 源路径 MUST位于已登记的 `resources/runtime/skills` 子树

#### Scenario: agentSkills 不参与 init baseline
- **WHEN** Agent 执行 `buildr init`
- **THEN** manifest 中声明的产品入口 Agent Skills MUST NOT被复制到目标 workspace `skills/` 目录
- **AND** Workspace `skills/manifest.yml` MUST由 writer 使用真实 Workspace identity 生成，并由 Builtin/Component 声明收敛

#### Scenario: package check 校验内置 Agent Skills
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST校验 manifest 声明的产品内置 Agent Skill 源路径存在
- **AND** Buildr MUST校验该 Skill 不包含 forbidden patterns
- **AND** Buildr MUST校验该 Skill 具备可渲染的 `SKILL.md`

#### Scenario: package check 校验 bootstrap 入口契约
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST从产品源码和正式 docs 校验 bootstrap guide 与 Buildr Skill 恢复契约
- **AND** MUST NOT要求已删除的 `package/bootstrap/` 文字资产存在
