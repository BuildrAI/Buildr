## ADDED Requirements

### Requirement: 随包 workspace AGENTS 提供默认提交语言
Buildr package MUST 通过随包 workspace `AGENTS.md` 提供默认 commit-message 语言约定，而不是把该默认值归属于 required Core。

#### Scenario: 初始化或同步默认 workspace
- **WHEN** Buildr initializes or synchronizes a workspace from the default package
- **THEN** the rendered workspace `AGENTS.md` MUST state that commit-message subject and body use Chinese when no more specific convention applies
- **AND** the rule MUST allow code identifiers、paths、scope and proper nouns to retain their original form

#### Scenario: 更具体约定覆盖默认语言
- **WHEN** Project、Service or repository rules define a more specific commit language
- **THEN** Agent MUST use the more specific convention instead of the workspace default

#### Scenario: Git Operations 生命周期变化
- **WHEN** Git Operations is absent、replaced or unavailable
- **THEN** the workspace commit-language default MUST remain available through `AGENTS.md`
- **AND** the default MUST NOT depend on the Git Operations Skill lifecycle

## MODIFIED Requirements

### Requirement: 产品验证覆盖提交信息资产边界
Buildr product verification MUST 防止提交格式与 workspace 默认语言重新耦合到同一 Skill 生命周期。

#### Scenario: 校验 Git Ops 提交格式
- **WHEN** Buildr validates the packaged Git Operations Skill
- **THEN** verification MUST confirm the concise Conventional Commits format、supported types、optional scope and breaking-change guidance
- **AND** verification MUST confirm Git Operations follows the current workspace、Project、Service and repository language conventions without creating a competing language default

#### Scenario: 校验 Core 默认提交语言
- **WHEN** Buildr validates the default package and a temporary initialized workspace
- **THEN** verification MUST confirm required Core does not own the commit-language default and the rendered workspace `AGENTS.md` contains the concise Chinese default and allowed original-form exceptions
- **AND** verification MUST confirm the workspace default remains present when Git Operations is absent

#### Scenario: 校验提交消费者组合
- **WHEN** Buildr validates Git Operations、Task Finish and other packaged commit-producing consumers
- **THEN** verification MUST confirm each consumer reads the current workspace language convention
- **AND** verification MUST NOT require Core to own or duplicate the commit-language default

## REMOVED Requirements

### Requirement: Package Core 提供默认提交语言
**Reason**: 默认提交语言迁移到随包 workspace `AGENTS.md`，让所有提交消费者共享同一 workspace 规则，并避免把仓库语言偏好放进通用 Core。
**Migration**: 新 package 和后续 `buildr sync` 会投射新的 `AGENTS.md` 规则；既有 Git 历史不变。

#### Scenario: Package Core 提供默认提交语言
- **WHEN** Buildr packages the default Git operations capability
- **THEN** the removed Core-owned commit-language requirement is replaced by the workspace `AGENTS.md` requirement
- **AND** Conventional Commits generation guidance remains provided by the Git operations Skill

### Requirement: Core 默认提交语言独立生效
**Reason**: Core 不再拥有提交语言事实；该事实由随包 workspace `AGENTS.md` 独立于 Git Operations Skill lifecycle 提供。
**Migration**: Agent 按当前 workspace、Project、Service 和 repository 规则生成提交信息；没有更具体约定时使用 workspace `AGENTS.md` 的中文默认。

#### Scenario: 初始化默认 workspace
- **WHEN** Buildr initializes a workspace from the default package
- **THEN** the rendered workspace `AGENTS.md` supplies the Chinese commit-message default when no more specific convention applies

#### Scenario: 卸载 Git Ops Skill
- **WHEN** Git Ops Skill is uninstalled
- **THEN** the workspace `AGENTS.md` commit-language default remains available to Agent rule consumption

#### Scenario: 更具体约定覆盖默认语言
- **WHEN** Project、Service or repository rules define a more specific commit language
- **THEN** Agent uses the more specific convention instead of the workspace default
