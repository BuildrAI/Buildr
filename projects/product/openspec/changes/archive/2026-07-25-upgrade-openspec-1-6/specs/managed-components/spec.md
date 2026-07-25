## MODIFIED Requirements

### Requirement: OpenSpec 作为首个随包 Component
Buildr MUST 随包提供 workspace 级 OpenSpec Component，统一管理 OpenSpec Command collection、经过评估的外部 workflow Skills 和 Buildr sidebar。

#### Scenario: OpenSpec Component 成员
- **WHEN** Buildr 初始化或更新默认启用 OpenSpec 的 workspace
- **THEN** OpenSpec Component MUST 包含 `commands/buildr/openspec/manifest.yml`
- **AND** Component MUST 以外部发布型 Skill 身份包含全部经 Buildr 评估支持的 `openspec-*` workflow Skills，包括 planning-only `openspec-update-change`
- **AND** Component MUST 包含已收敛到上游未覆盖职责的 `openspec-contract-guard` 和只表达 Buildr 特有增量的 sidebar contributions
- **AND** Component 定义 MUST 分别记录 OpenSpec 上游版本、外部 Skill 来源与 integrity，以及 Buildr sidebar 成员 integrity
- **AND** Component MUST NOT 在 `skills/buildr/openspec-*` 下物化外部 workflow Skill fork

#### Scenario: OpenSpec CLI 仍是外部工具
- **WHEN** OpenSpec Component 安装或更新
- **THEN** Buildr MUST 只声明并检查 OpenSpec CLI
- **AND** Buildr MUST NOT 自动安装、升级或卸载本机 OpenSpec CLI

#### Scenario: OpenSpec Component 不拥有 Project 数据
- **WHEN** OpenSpec Component 安装、更新或卸载
- **THEN** Buildr MUST NOT 创建、修改或删除任何 Project 的 `openspec/` 内容

### Requirement: OpenSpec Component 交付 Buildr 契约门禁 sidebar
Buildr MUST 将 OpenSpec 契约门禁作为现有 OpenSpec Component 的 Buildr 自有 sidebar 成员交付，并保持外部 OpenSpec 工具链的独立升级边界。

#### Scenario: OpenSpec Component 成员包含门禁 Skill
- **WHEN** Buildr 初始化或更新默认启用 OpenSpec 的 workspace
- **THEN** OpenSpec Component MUST 同时包含上游 workflow Skills、OpenSpec Command collection 和 `openspec-contract-guard` Skill
- **AND** Component integrity MUST 覆盖该门禁 Skill

#### Scenario: 门禁更新不改外部 Skills
- **WHEN** Buildr 发布新版契约门禁
- **THEN** Component update MUST 通过正常三方比较更新 Buildr sidebar 成员
- **AND** Component MUST NOT 为加入门禁而修改外部 `openspec-*` workflow Skill 的正文

#### Scenario: OpenSpec 1.6.0 上游升级
- **WHEN** Buildr 更新 OpenSpec Component 的 upstream version 和上游 workflow Skills 到 `1.6.0`
- **THEN** package verification MUST 同时验证门禁对该 upstream version 的兼容性
- **AND** Component MUST 保持外部 CLI 只声明和检查、Project OpenSpec 内容不归 Component 所有的既有边界
- **AND** Component MUST NOT 将 OpenSpec Stores beta 声明为 Component member、Buildr sidebar 或 Project-owned data
- **AND** package verification MUST 区分上游 1.6.0 已提供的 parser/archive safety 与 Buildr guard 保留的 baseline、active conflict、pre-sync receipt 和 post-sync evidence
