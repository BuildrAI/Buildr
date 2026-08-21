## MODIFIED Requirements

### Requirement: Git Operations 生成精简提交信息
Buildr `git-operations` Skill MUST 为已授权 commit operation 提供精简的 Conventional Commits 提交信息规则，并 MUST 遵循当前 workspace、Project、Service 和 repository 的提交语言约定。

#### Scenario: 生成提交主题
- **WHEN** Agent 为已确认提交范围生成 commit message
- **THEN** subject MUST 使用 `<type>(<scope>): <subject>` 格式，其中 scope 可选
- **AND** type MUST 从 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert` 中选择
- **AND** Agent MUST 基于实际提交内容选择 type 和 scope，不得猜测不明确的 scope

#### Scenario: 补充正文或破坏性变更
- **WHEN** 变更动机、行为差异或破坏性影响需要补充说明
- **THEN** Agent MUST 使用可选正文说明动机和行为差异
- **AND** 破坏性变更 MUST 使用 `BREAKING CHANGE:` 说明
- **AND** 不需要补充信息时 MUST 保持仅一行 subject

#### Scenario: 应用提交语言约定
- **WHEN** Agent 使用 Git Operations 生成 commit message
- **THEN** Git Operations MUST 遵循当前 workspace `AGENTS.md` 的默认提交语言和当前 scope 的更具体约定
- **AND** Git Operations MUST NOT 在 Skill 正文中创建与 workspace 规则竞争的独立语言默认

#### Scenario: 仓库已有明确格式
- **WHEN** 项目或仓库规则定义了比 workspace 默认格式更具体的提交约定
- **THEN** Agent MUST 遵循更具体的项目或仓库约定
