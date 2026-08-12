## ADDED Requirements

### Requirement: 产品入口 Buildr Skill 分离宿主身份与投射目标
产品入口 Buildr Skill MUST 将当前宿主 Agent、用户明确指定的维护目标和 Buildr 投射 adapter 视为不同事实。普通面向当前环境的操作 MUST 使用宿主明确提供且受支持的 adapter；只有用户明确指定其他 runtime 时才能改用该目标。

#### Scenario: Qoder 读取 Codex 投射后更新 workspace
- **WHEN** Qoder 会话发现了由 Codex adapter 投射到 `.agents/skills/` 的 Buildr Skill，且用户只要求“更新 workspace”
- **THEN** Buildr Skill MUST 使用 `qoder` 执行 workspace sync 和后续 Doctor
- **AND** MUST NOT 因投射路径、生成正文或已有 Codex runtime 而使用 `codex`

#### Scenario: 用户明确维护其他 runtime
- **WHEN** 当前宿主是 Qoder，且用户明确要求更新 Codex runtime
- **THEN** Buildr Skill MUST 允许把本次明确目标设为 `codex`
- **AND** MUST NOT 把该目标改写为当前宿主身份

#### Scenario: 当前宿主身份无法确认
- **WHEN** Agent 宿主没有提供可与 supported adapter 对齐的明确身份，且用户也未明确指定目标
- **THEN** Buildr Skill MUST 在执行需要 `<agent>` 的命令前停止并请求确认
- **AND** MUST NOT 使用投射文件、受支持列表或其他 adapter 作为 fallback

### Requirement: 产品入口 Buildr Skill 禁止从投射诊断推断宿主身份
产品入口 Buildr Skill MUST 明确禁止从 Skill 路径、generated marker、投射回执以及 Doctor 的 `requested`、`selected` 或 `detectedAgents` 推断当前宿主 Agent。

#### Scenario: Doctor 检查显式 adapter
- **WHEN** Agent 运行 `buildr doctor --agent codex`
- **THEN** Buildr Skill MUST 将结果解释为检查了调用者显式选择的 Codex runtime
- **AND** MUST NOT 将 `selected: codex` 或包含 `codex` 的 `detectedAgents` 解释为宿主身份验证
