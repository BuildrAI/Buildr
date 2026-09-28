## MODIFIED Requirements

### Requirement: 产品入口 Buildr Skill 分离宿主身份与投射目标
产品入口 Buildr Skill MUST 将当前宿主 Agent、用户明确指定的维护目标和 Buildr 投射 adapter 视为不同事实。普通面向当前环境的操作 MUST 保留宿主明确提供的真实 runtimeId，由统一选择规则采用标准或专用 adapter；用户明确指定其他 runtime 时使用该维护目标但不改写宿主身份。

#### Scenario: Qoder 读取 Codex 投射后更新 workspace
- **WHEN** Qoder 会话发现了由 Codex adapter 投射到 `.agents/skills/` 的 Buildr Skill，且用户只要求“更新 workspace”
- **THEN** Buildr Skill MUST 使用 `qoder` 执行 workspace sync 和后续 Doctor
- **AND** MUST NOT 因投射路径、生成正文或已有 Codex runtime 而使用 `codex`

#### Scenario: 用户明确维护其他 runtime
- **WHEN** 当前宿主是 Qoder，且用户明确要求更新 Codex runtime
- **THEN** Buildr Skill MUST 允许把本次明确目标设为 `codex`
- **AND** MUST NOT 把该目标改写为当前宿主身份

#### Scenario: 当前宿主身份无法确认
- **WHEN** Agent 宿主没有提供明确身份，且用户也未明确指定目标
- **THEN** Buildr Skill MUST 允许省略运行时身份，由统一选择规则保留唯一既有接入或使用标准默认值；多个不等价既有选择时只暂停受影响写入并请求选择
- **AND** MUST NOT 从投射文件或列表推断宿主身份，也 MUST NOT 在已选实现执行失败后切换另一适配器（Adapter）
