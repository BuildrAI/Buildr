## MODIFIED Requirements

### Requirement: 场景化内置流程以 Skills 发布
Buildr package assets MUST 将由任务意图触发的场景化流程指引发布为内置 Skills，不得发布任何内置 Rules。

#### Scenario: package 声明场景化流程指引
- **WHEN** Buildr package 包含需要按任务意图、工作流阶段、风险条件或命令流程判断是否适用的指引
- **THEN** `package/manifest.yml` MUST 将该指引声明为内置 Skill
- **AND** 对应默认 workspace baseline MUST 在 `skills/manifest.yml` 中登记该 Skill
- **AND** Buildr MUST NOT 将该指引发布为内置 Rule

#### Scenario: package 声明 invariant 指引
- **WHEN** Buildr package 包含定义 workspace 模型、源资产边界、必读入口或常驻 invariant 的指引
- **THEN** 该指引 MUST 按需位于 Buildr 技能（Skill）或产品说明，不得强制写入用户根规则
- **AND** Buildr MUST NOT 将其发布为独立内置 Rule 文件

### Requirement: Required Core 暴露 Rule 消费协议
Buildr MUST 按实际存在的 `AGENTS.md` 层级发现规则，不再向用户根文件强制写入通用规则消费协议；专业流程继续由对应技能（Skill）、能力绑定（Capability Binding）、应用（Application）和项目声明承担。

#### Scenario: Package Core 声明 Rule 状态语义
- **WHEN** 智能体（Agent）维护规则或查找 Buildr 使用方法
- **THEN** Buildr MUST 通过技能（Skill）说明层级发现和资产边界，不以根默认区块作为前置条件
- **AND** 用户 MUST 能自行决定项目规则与沟通约定

#### Scenario: Package Core 限定 scope Rules 内容
- **WHEN** 用户编写根、项目或服务规则
- **THEN** Buildr MUST 尊重用户自有约定，不自动插入内容限制或治理模板

#### Scenario: Rule 只声明专业 owner
- **WHEN** Buildr 技能说明专业职责
- **THEN** 技能说明（Skill Description）MUST 继续承担意图发现，能力绑定（Capability Binding）继续选择提供者（Provider），专业流程与结果不依赖根默认段

#### Scenario: Package Core 不承载操作手册
- **WHEN** Buildr 交付专业操作方法
- **THEN** 可复用流程 MUST 通过对应技能（Skill）提供，不强制写入用户根文件

### Requirement: 唯一内联核心规则源
Buildr MUST 停止将随包历史核心规则作为所有用户工作空间（Workspace）的必装资产。旧原文只用于历史来源识别，不参与初始化、同步修复或诊断正文比较。

#### Scenario: 发布与诊断消费同一规则源
- **WHEN** 执行初始化、更新、同步或诊断
- **THEN** Buildr MUST NOT 创建、插入、替换或修复根默认规则
- **AND** 已有正文（含旧区块）MUST 逐字保留
- **AND** 发布物 MUST NOT 增加独立 `rules/buildr/` 内置规则

#### Scenario: 识别历史来源
- **WHEN** 观察到根 `AGENTS.md`
- **THEN** 精确匹配随包历史正文的区块 MUST 允许只读来源识别
- **AND** 普通自有规则没有该区块 MUST 不被判为来源冲突
- **AND** Buildr MUST NOT 为证明来源而修复文件

#### Scenario: 工作空间承载普通业务软件
- **WHEN** 用户使用 Buildr 开发普通业务软件
- **THEN** Buildr MUST NOT 通过默认规则强制产品架构、沟通风格或交付授权

#### Scenario: 多入口接续产物
- **WHEN** 多个入口接续同一成果
- **THEN** 相关能力 MUST 继续保护对象身份和版本，不依赖根默认规则声明
