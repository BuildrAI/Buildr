## ADDED Requirements

### Requirement: 内置 Skill routing description 必须保持单一事实
Buildr MUST 让内置 Skill 的 package manifest description、workspace baseline manifest description 与 Skill frontmatter description 完全一致，并 MUST 在 package check 中阻止 drift。

#### Scenario: package 与 workspace description 不一致
- **WHEN** package check 发现同一 builtin Skill 的任一 manifest description 与源 `SKILL.md` frontmatter 不一致
- **THEN** verification MUST 失败并报告 Skill id 与不一致来源
- **AND** Buildr MUST NOT 把 capability binding ready 表述为 routing description 已对齐

#### Scenario: workspace sync 更新 routing description
- **WHEN** 新 package 修改 builtin Skill frontmatter description
- **THEN** sync MUST 将相同 description 写入 workspace `skills/manifest.yml`
- **AND** runtime projection MUST 使用该源 Skill 的一致 description
