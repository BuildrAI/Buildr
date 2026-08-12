## MODIFIED Requirements

### Requirement: Package verification 覆盖 destination 与冲突迁移
产品验证 MUST 覆盖 workspace-only source、user/workspace render destination、effective inventory conflict，以及 legacy Project Skill source 被拒绝且不存在自动迁移路径。

#### Scenario: 临时 workspace Skill 生命周期
- **WHEN** package verification 创建临时 workspace 并维护 Skill
- **THEN** verification MUST 覆盖 workspace add/remove、workspace render、显式 user render 隔离和最终 doctor
- **AND** MUST 证明 init/sync 不写用户层

#### Scenario: Project Skill migration fixtures
- **WHEN** verification 检查包含 legacy Project Skill manifest 或 source 的 workspace
- **THEN** MUST 验证 Doctor 与 Skills CLI fail closed 且不返回可执行 migration command
- **AND** MUST 证明当前产品不会复制、合并、删除或改写 legacy Project Skill bytes
