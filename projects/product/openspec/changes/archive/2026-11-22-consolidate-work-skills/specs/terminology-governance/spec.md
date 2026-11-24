## MODIFIED Requirements

### Requirement: Buildr 必须提供术语治理能力契约
Buildr MUST 提供 `buildr.terminology-governance/v1` capability contract，并 MUST 提供默认 workspace Skill provider `current-knowledge-maintenance`；升级 MUST 保留用户自选绑定。Contract MUST 要求 provider 解析当前 Project、定位 canonical glossary、检查已有术语、识别同义词、一词多义、中英不一致、新术语和作用域冲突。

#### Scenario: Consumer 请求术语对齐
- **WHEN** consumer 通过 binding 使用 `buildr.terminology-governance/v1`
- **THEN** selected provider MUST 先读取 contract、Project context 和现有 canonical terms
- **AND** provider MUST NOT 依据具体 Skill id、固定命令或安装顺序推断调用关系

#### Scenario: 默认 provider 被替换
- **WHEN** workspace 绑定兼容的替代 provider
- **THEN** consumers MUST 继续依赖相同 capability guarantees 和 result evidence
- **AND** Buildr MUST NOT 要求修改 external OpenSpec Skill 源以适配 provider identity
