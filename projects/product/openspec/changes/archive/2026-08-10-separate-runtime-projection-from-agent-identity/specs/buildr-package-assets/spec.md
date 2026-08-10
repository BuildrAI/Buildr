## ADDED Requirements

### Requirement: bootstrap 契约校验 adapter-neutral 产品 Skill
Buildr package bootstrap 契约 MUST 校验生成的产品入口 Skill包含宿主身份选择边界，并 MUST 拒绝把投射 adapter 注入为当前 Agent 身份或固定维护命令。

#### Scenario: package check 检查生成 Skill
- **WHEN** 维护者运行 `buildr package check`
- **THEN** package check MUST 验证产品入口 Skill要求从宿主明确身份或用户明确目标选择 `<agent>`
- **AND** MUST 验证生成 Skill 不包含“当前 Agent Adapter”或“当前安装 adapter”身份声明

#### Scenario: 所有 supported adapters 使用相同执行边界
- **WHEN** package contract 为所有 supported adapters 生成产品入口 Buildr Skill
- **THEN** 每份生成 Skill MUST 包含相同的 adapter-neutral 身份边界
- **AND** MUST NOT 因投射 adapter 不同而生成不同的默认维护目标
