## MODIFIED Requirements

### Requirement: doctor 报告 AGENTS required block
Buildr doctor MUST NOT 将根 `AGENTS.md` 或旧默认区块作为必需资产。

#### Scenario: required block 缺失或损坏
- **WHEN** 根文件不存在、没有旧区块、区块已编辑或标记不完整
- **THEN** doctor MUST NOT 发出 `rules.required_block_invalid` 或要求恢复默认规则
- **AND** doctor MUST 继续诊断其他资产和运行时（Runtime）状态

#### Scenario: Codex runtime 当前有效
- **WHEN** Codex 技能（Skill）投射为最新且其他适用检查有效
- **THEN** doctor MUST 不因根默认区块缺失而否定运行时（Runtime）状态

### Requirement: doctor 严格验证 canonical workspace identity
Buildr doctor MUST 使用 canonical workspace 必要资产判断 workspace validity，并区分有效、不完整与不存在。

#### Scenario: canonical workspace identity 有效
- **WHEN** `.buildr/workspace.yml` 和 `projects/` 均存在，无论根 `AGENTS.md` 是否存在
- **THEN** doctor MUST 将 workspace identity 报告为 `valid`
- **AND** `workspace.initialized` MUST 为 true

#### Scenario: workspace identity 不完整
- **WHEN** 目标目录存在部分但不是全部 canonical workspace 必要资产
- **THEN** doctor MUST 将 workspace identity 报告为 `incomplete`
- **AND** `workspace.initialized` MUST 为 false
- **AND** doctor MUST 报告缺失的必要资产和可执行的初始化或恢复建议

#### Scenario: workspace identity 不存在
- **WHEN** 目标目录不存在任何 canonical Buildr workspace 痕迹
- **THEN** doctor MUST 将 workspace identity 报告为 `absent`
- **AND** doctor MUST 报告 workspace 未初始化

#### Scenario: 只有用户自有根规则
- **WHEN** 目录只有用户自有 `AGENTS.md`，没有工作空间元数据和项目目录
- **THEN** doctor MUST 将 Buildr 身份报告为 `absent`，不得将普通规则文件视为初始化痕迹
