## MODIFIED Requirements

### Requirement: Required Core 暴露 Rule 消费协议
Buildr package assets MUST 将 Rule manifest consumption protocol 与通用 Rule/Skill 权威边界保留在 required Buildr Core 中，同时 MUST 将 task-triggered professional procedures 和专业状态事实保留在对应 Skills、capability bindings、Applications 或 Project declarations 中。

#### Scenario: Package Core 声明 Rule 状态语义
- **WHEN** Buildr packages or validates `rules/buildr/core.md`
- **THEN** required Core MUST state that enabled、required and installed Rules are always read
- **AND** required Core MUST state that enabled optional installed Rules are selected semantically from description and task context
- **AND** required Core MUST state that disabled or uninstalled Rules do not participate in the task

#### Scenario: Package Core 限定 scope Rules 内容
- **WHEN** required Core 说明 root、Project 或 Service `AGENTS.md` 可以增加的 scope-specific 内容
- **THEN** Core MUST 将其限制为价值观、权威边界、授权边界、约束和结果不变量
- **AND** Core MUST NOT 让这些 Rules 承担 Skill routing、命令序列、生命周期步骤、重跑/恢复策略、报告模板或专业 Result/status 副本

#### Scenario: Rule 只声明专业 owner
- **WHEN** root、Project 或 Service Rule 需要约束某项专业动作不得被绕过
- **THEN** required Core MUST allow the Rule to name the owning Skill、capability、Application or declaration and state the no-bypass invariant
- **AND** Skill description MUST remain the user-intent discovery authority
- **AND** capability binding MUST remain the provider-selection authority
- **AND** the owning Skill/Application MUST remain the procedure and professional-result authority
- **AND** the Rule MUST NOT copy that owner's playbook or current state

#### Scenario: Package Core 不承载操作手册
- **WHEN** Buildr packages Rule consumption guidance
- **THEN** required Core MUST NOT copy task-specific Git、OpenSpec、worktree or other operational procedures
- **AND** required Core MUST NOT state that Project or Service Rules may own concrete task procedures
- **AND** reusable task procedures MUST remain available through the corresponding Skills

#### Scenario: Package Core 提供默认提交语言
- **WHEN** Buildr packages the default Git operations capability
- **THEN** Conventional Commits generation guidance MUST be provided by the Git operations Skill
- **AND** required Core MUST define Chinese as the default commit-message language when no more specific convention applies
- **AND** required Core MUST NOT contain Git commands、type selection or message generation procedures
