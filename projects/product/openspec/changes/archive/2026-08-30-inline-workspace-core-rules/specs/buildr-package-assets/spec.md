## MODIFIED Requirements

### Requirement: Required Core 暴露 Rule 消费协议
Buildr package assets MUST 将 Rule manifest consumption protocol 与通用 Rule/Skill 权威边界保留在 根 `AGENTS.md` 受管区块中（原核心规则，下文沿用 Core 名称），同时 MUST 将 task-triggered professional procedures 和专业状态事实保留在对应 Skills、capability bindings、Applications 或 Project declarations 中。

#### Scenario: Package Core 声明 Rule 状态语义
- **WHEN** Buildr packages or validates 根 `AGENTS.md` 受管区块
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

## ADDED Requirements

### Requirement: 唯一内联核心规则源
Buildr MUST 只在随包工作空间 `AGENTS.md` 受管区块维护核心规则正文，纳入已确认的六条智能体优先原则，并保留授权、真实事实、用户沟通、工作资产职责及产品边界。实现和适配器 MUST 消费该来源，不复制正文或继续要求独立 Core 文件。

#### Scenario: 发布与诊断消费同一规则源
- **WHEN** 初始化、同步、更新或诊断工作空间
- **THEN** 系统 MUST 使用同一随包区块生成或比较完整正文，而非仅检查旧文件引用
- **AND** 发布物 MUST NOT 包含独立 `rules/buildr/core.md` 或其专属内置登记

## REMOVED Requirements

### Requirement: Required Core 明确文本文件 EOF 不变量
**Reason**: 核心规则源不再独立存在，最新产品规则已将文本末尾约束局部化到产品项目，不向用户工作空间重新引入。
**Migration**: 产品源码继续遵循产品项目 `AGENTS.md` 中的文本末尾约束。

#### Scenario: Package 校验 Core EOF 正反例
- **WHEN** 校验随包核心规则
- **THEN** 系统 MUST NOT 要求独立 Core 文件或向用户重新强加产品本地文本格式约束

#### Scenario: Agent 新建或重写文本文件
- **WHEN** 在产品源码树新建或重写文本文件
- **THEN** 智能体 MUST 遵循产品项目的局部文本约束
