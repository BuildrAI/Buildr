## MODIFIED Requirements

### Requirement: Package 必须投射独立 UI Prototype Skill
Buildr package MUST 提供 id 为 `ui-prototype` 的 optional workspace Skill，并 MUST 将其作为普通 `skills/buildr/*` 资产同步和投射到支持的 Agent runtime。该 Skill MUST NOT 建立 capability contract 或 provider binding；用户在适用 scope 提供同名 Skill 时，MUST 沿用现有 Skill 重载与选择语义替换默认实现。

#### Scenario: Workspace 同步 UI Prototype Skill
- **WHEN** Buildr 将 package 资产同步到支持的 workspace runtime
- **THEN** `ui-prototype` MUST 作为 optional builtin Skill 可被发现
- **AND** 用户卸载或同名重载 optional Skill 时 MUST 遵守现有 builtin 投射与 Skill selection 语义

#### Scenario: 审查能力边界
- **WHEN** 维护者检查 `ui-prototype` 的 package manifest 与 Skill 正文
- **THEN** Skill MUST 不声明 `provides` 或 `requires` capability
- **AND** MUST 明确区别于正式设计、正式行为规范（Specification）和上线交付；MUST 允许隔离位置的源码复用与候选预览构建，且保持模拟操作与真实副作用隔离

## ADDED Requirements

### Requirement: 产品提供可选前端开发技能
Buildr MUST 随包提供 id 为 `frontend-development` 的可选前端开发技能（Skill），通过既有同步、卸载、同名重载及运行时（Runtime）投射方式发现和使用；MUST 不创建强制能力依赖、专用状态或审批门禁。新技能（Skill）MUST 与已有代码架构、体验设计及原型职责互补，不要求用户逐次手动指定才保持适用范围内的一致开发方式。

#### Scenario: 安装和重载
- **WHEN** 当前工作空间（Workspace）启用该可选技能（Skill），或提供同名实现
- **THEN** Buildr MUST 按既有选择与投射语义使用它；卸载 MUST 不阻止无关任务推进
