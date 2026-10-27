## MODIFIED Requirements

### Requirement: doctor 报告 manifest 对齐
Buildr doctor MUST 报告已退役 Rule 资产的迁移提示，以及 Skills 源资产与 `skills/manifest.yml` 的对齐状态。

#### Scenario: Rules manifest 不对齐
- **WHEN** workspace 包含非空 `rules/manifest.yml` 登记项，或 `rules/` 下存在 `.md` 文件，或 `rules/manifest.yml` 无法解析
- **THEN** doctor MUST 报告 warning，说明 Rule 资产登记机制已退役
- **AND** doctor MUST 提供将规则正文迁移到组织根、项目或服务 `AGENTS.md` 的指引
- **AND** doctor MUST NOT 建议或要求运行 `rules add/remove`
- **AND** 该 finding MUST NOT 阻断其他诊断、workspace readiness 或无关工作

#### Scenario: Rule metadata 缺失
- **WHEN** `rules/manifest.yml` 中的规则 entry 缺少 `description` 或包含其他已退役 metadata
- **THEN** doctor MUST NOT 将该 metadata 作为当前 Rule 消费或 manifest 对齐诊断依据
- **AND** doctor MUST 只报告 Rule 资产已退役的迁移 warning
- **AND** doctor MUST NOT 要求用户补充或修复已退役的 Rule metadata

#### Scenario: 空 Rule manifest 不产生噪音
- **WHEN** `rules/manifest.yml` 存在但没有登记项
- **THEN** doctor MUST NOT 因此报告 warning
- **AND** doctor MUST NOT 删除或改写该文件

#### Scenario: Skills manifest 不对齐
- **WHEN** `skills/` 下存在未登记的 Skill 目录，或 `skills/manifest.yml` 登记的目录缺失
- **THEN** doctor MUST 报告 warning
- **AND** `skills/buildr/` 下未登记目录 MUST 使用更高优先级 warning
