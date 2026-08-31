## MODIFIED Requirements

### Requirement: 初始化创建可直接工作的根资产
`buildr init` MUST create workspace assets that can receive Buildr product builtins and Components and render supported Agent runtimes.

#### Scenario: 初始化根资产
- **WHEN** Agent executes `buildr init --target <dir> --name <name> [--description <description>]`
- **THEN** Buildr MUST create root source assets including `.buildr/`, `rules/`, `skills/`, `commands/`, `components/` and `projects/`
- **AND** Buildr MUST NOT create a root `practices/` directory
- **AND** Buildr MUST create `.buildr/workspace.yml` with `schemaVersion: buildr.workspace/v1`、a generated UUID、name and description
- **AND** 未提供 description 时 Buildr MUST 写入明确 TODO 并让 doctor 产生可见提示
- **AND** Buildr MUST create `rules/manifest.yml`, `skills/manifest.yml`, `commands/manifest.yml`, `components/manifest.yml` and `projects/manifest.yml`
- **AND** `skills/manifest.yml` MUST declare `schemaVersion: buildr.skills/v1`
- **AND** `skills/manifest.yml.workspaceId` MUST equal `.buildr/workspace.yml.id`
- **AND** `components/manifest.yml` MUST declare `schemaVersion: buildr.components/v1`
- **AND** `projects/manifest.yml` MUST declare `schemaVersion: buildr.projects/v2`
- **AND** Buildr MUST create root `AGENTS.md` required block 并内联随包核心规则正文
- **AND** Buildr MUST be able to render initial Agent runtime for supported adapters

#### Scenario: 初始化 Codex runtime
- **WHEN** Buildr initializes a new workspace for Codex usage
- **THEN** Buildr MUST keep `AGENTS.md` as the native Codex rule entry
- **AND** Buildr MUST be able to project enabled Skills, including enabled Component Skills, to `.agents/skills/`

#### Scenario: 初始化 Claude Code runtime
- **WHEN** Buildr initializes or syncs workspace for Claude Code usage
- **THEN** Buildr MUST be able to generate Claude Code runtime projection from the same Buildr source assets, enabled builtins and enabled Components model

### Requirement: 已有 workspace 升级兼容
Buildr MUST 支持已有 Buildr workspace 兼容内置能力和 adapter render 模型。

#### Scenario: 已有 workspace update
- **WHEN** Agent 在已有初始化 workspace 中运行 Buildr update
- **THEN** Buildr MUST 保留已有用户资产
- **AND** Buildr MUST 增加或更新 manifest 中的产品内置能力状态，同时不静默覆盖用户编写的规则正文

#### Scenario: 保留遗留 Practices 目录
- **WHEN** 已有 workspace root 或已登记 Project 中存在 `practices/` 目录
- **THEN** Buildr init、update、sync、Project repair 和 doctor MUST NOT 删除、覆盖、移动或读取其中内容
- **AND** 该目录 MUST NOT 阻塞正常命令或被视为缺失的当前 baseline 资产
- **AND** doctor with information findings enabled MUST report an informational finding that does not require immediate user action

#### Scenario: 已有 AGENTS
- **WHEN** 已有 workspace 中存在 `AGENTS.md`
- **THEN** Buildr MUST 只检查并修复 Buildr required block
- **AND** Buildr MUST NOT 覆盖用户正文

#### Scenario: 旧版规则迁入
- **WHEN** 已有 workspace 使用旧版 package baseline rules
- **THEN** Buildr MUST 将核心规则内联到根 `AGENTS.md`，其他专业规则仍使用通用规则清单
- **AND** Buildr MUST 将旧 `runtime.md` 语义内化进 根 `AGENTS.md` 受管区块
