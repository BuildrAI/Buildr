## MODIFIED Requirements

### Requirement: Runtime投射必须来自Workspace source
更新后的Skills/contracts MUST从Product package source同步到Workspace source再投射当前Agent runtime；派生`.agents/skills` MUST不作为长期编辑authority。

#### Scenario: 自举同步
- **WHEN** Buildr Task的真实Git交付包含Skill或contract source变化并命中self-bootstrap范围
- **THEN** self-bootstrap MUST按当前delivered ref与真实变化执行适用sync/render
- **AND** 最终Doctor MUST证明selected Agent graph与projection ready
