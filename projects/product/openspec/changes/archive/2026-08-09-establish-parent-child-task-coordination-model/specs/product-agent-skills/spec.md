## ADDED Requirements

### Requirement: Task Skills 必须解释协调与专业 authority 边界
Buildr package MUST更新Task Manager、Triage、Development、Review与Finish Skills，使Agent能发现Parent Plan/Contribution意图、创建独立Child、形成Contribution Handoff、显式reconcile并完成Parent最终验收；Skills MUST NOT引导双写、checkbox同步或自动状态传播。

#### Scenario: runtime Agent读取新流程
- **WHEN** 用户要求创建Parent或从Contribution启动Child
- **THEN** matching Skill MUST路由到现有Task/Development/Review/Finish capabilities与Parent coordination actions
- **AND** MUST明确禁止继承Parent Change和推断delivery

### Requirement: Runtime投射必须来自Workspace source
更新后的Skills/contracts MUST从Product package source同步到Workspace source再投射当前Agent runtime；派生`.agents/skills` MUST NOT作为长期编辑authority。

#### Scenario: 自举同步
- **WHEN** Formal Finish交付包含Skill或contract source变化
- **THEN** self-bootstrap MUST按冻结Contribution执行适用sync/render
- **AND** 最终Doctor MUST证明selected Agent graph与projection ready
