## MODIFIED Requirements

### Requirement: 初始化创建可直接工作的根资产
`buildr init` MUST create workspace assets that can receive Buildr product builtins and Components and render supported Agent runtimes, without creating a retired Rule asset registry.

#### Scenario: 初始化根资产
- **WHEN** 智能体（Agent）在 `.buildr/workspace.yml` 及项目、服务、代码库三份清单路径均无既有文件系统条目（Filesystem Entry，包括文件、目录或链接）的全新目录执行 `buildr init --target <dir> --name <name> [--description <description>]`
- **THEN** Buildr MUST create root source assets including `.buildr/`, `skills/`, `commands/`, `components/` and `projects/`
- **AND** Buildr MUST NOT create a root `rules/` directory or `rules/manifest.yml`
- **AND** Buildr MUST NOT create a root `practices/` directory
- **AND** Buildr MUST create `.buildr/workspace.yml` with `schemaVersion: buildr.workspace/v1`、a generated UUID、name and description
- **AND** 未提供 description 时 Buildr MUST 写入明确 TODO 并让 doctor 产生可见提示
- **AND** Buildr MUST create `skills/manifest.yml`, `commands/manifest.yml`, `components/manifest.yml` and `projects/manifest.yml`
- **AND** `skills/manifest.yml` MUST declare `schemaVersion: buildr.skills/v3`
- **AND** `skills/manifest.yml.workspaceId` MUST equal `.buildr/workspace.yml.id`
- **AND** `components/manifest.yml` MUST declare `schemaVersion: buildr.components/v1`
- **AND** `projects/manifest.yml` MUST declare `schemaVersion: buildr.projects/v2`
- **AND** 空的全局 `services/manifest.yml` 与 `repositories/manifest.yml` MUST 分别使用 `buildr.services/v3` 与 `buildr.repositories/v1`；已有布局继续遵循显式迁移与恢复边界，不以初始化补齐半完成全局清单
- **AND** Buildr MUST create root `AGENTS.md` required block 并内联随包核心规则正文
- **AND** Buildr MUST be able to render initial Agent runtime for supported adapters

#### Scenario: 初始化 Codex runtime
- **WHEN** Buildr initializes a new workspace for Codex usage
- **THEN** Buildr MUST keep `AGENTS.md` as the native Codex rule entry
- **AND** Buildr MUST be able to project enabled Skills, including enabled Component Skills, to `.agents/skills/`

#### Scenario: 初始化 Claude Code runtime
- **WHEN** Buildr initializes or syncs workspace for Claude Code usage
- **THEN** Buildr MUST be able to generate Claude Code runtime projection from the same Buildr source assets, enabled builtins and enabled Components model

### Requirement: 默认 workspace 规则路由工具型资产维护
默认工作空间（Workspace）规则（Rule）MUST 保护源资产权威、所有权和授权边界；Buildr 技能（Skill）MUST 负责工具型资产维护的发现、方法、命令与恢复指引，规则（Rule）MUST NOT 复制这些执行流程。

#### Scenario: Agent 读取默认规则
- **WHEN** 智能体（Agent）读取 `buildr init` 生成的 `AGENTS.md`
- **THEN** 规则（Rule）MUST 说明 Buildr 管理长期源资产和可重建投射
- **AND** MUST 说明运行时（Runtime）、本机状态、凭证和临时提示词不是源资产

#### Scenario: 用户要求维护 manifest-backed 工具型资产
- **WHEN** 用户要求新增、修改或删除可复用技能（Skill）或命令（Command）
- **THEN** Buildr 技能（Skill）MUST 按相应清单和命令维护源资产
- **AND** MUST 按需在源资产维护后执行投射或补齐本机环境，并遵守既有授权

#### Scenario: 用户要求维护规则资产
- **WHEN** 用户要求维护组织根规则（Rule）或项目（Project）、服务（Service）规则（Rule）
- **THEN** Buildr 技能（Skill）MUST 引导 Agent 直接维护组织根、项目或服务目录的 `AGENTS.md` 正文
- **AND** MUST 说明规则适用性由 `AGENTS.md` 层级与作用域决定，不再使用 `rules/manifest.yml` 或 `rules add/remove`
- **AND** MUST 保留受管区块（Managed Block）所有权和用户正文，仅由正式维护入口更新受管区块（Managed Block）

#### Scenario: Agent 不确定如何维护资产
- **WHEN** 智能体（Agent）不确定如何维护工具型资产
- **THEN** 智能体（Agent）MUST 按用户意图发现 Buildr 技能（Skill）并按需读取当前命令帮助
- **AND** 技能（Skill）不可用时 MUST 根据 `buildr help skill install` 与命令参考修复相应入口

#### Scenario: runtime 或本机缺少能力
- **WHEN** 当前运行时（Runtime）缺少技能（Skill）或本机缺少命令（Command）
- **THEN** 智能体（Agent）MUST 依据当前诊断定位缺失边界，并在已有授权内执行对应恢复
- **AND** MUST NOT 因局部能力缺失阻止其他不依赖该能力的已授权工作

### Requirement: Service 层级源资产支持作为后续统一方向
Buildr MUST 在产品路线中将 service 层级源资产支持作为统一后续方向记录，而不是在单个 manifest-backed 命令中局部引入不一致的 service scope。

#### Scenario: 记录 service 层级方向
- **WHEN** Buildr 文档描述 manifest-backed 资产维护命令的 scope 边界
- **THEN** 文档 MUST 说明本变更不改变现有 scope 模型
- **AND** 文档 MUST 记录后续统一评估 service scope 下 skills、commands 或后续源资产模块的解析、叠加/覆盖、来源链和权限模型
- **AND** 规则（Rule）MUST 继续由组织根、项目、服务目录的 `AGENTS.md` 层级承载，不进入该 manifest-backed 统一范围

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
- **WHEN** 已有 workspace 使用旧版 package baseline rules 或 `rules/manifest.yml`
- **THEN** Buildr MUST 将核心规则内联到根 `AGENTS.md` 受管区块
- **AND** 其他专业规则 MUST 由组织根、项目、服务目录的 `AGENTS.md` 层级承载
- **AND** Buildr MUST NOT 自动删除或改写已有 `rules/manifest.yml` 与 `rules/*.md`
- **AND** Buildr MUST 将旧 `runtime.md` 语义内化进根 `AGENTS.md` 受管区块

#### Scenario: 已有 Rules 资产不阻断升级
- **WHEN** 已有 workspace 包含 `rules/manifest.yml` 或 `rules/*.md`
- **THEN** init、update、sync 与 workspace 准备 MUST 保留这些文件并继续完成
- **AND** doctor MUST 报告带迁移指引的 warning
- **AND** 该 warning MUST NOT 阻止 workspace readiness、其他诊断或无关工作

## REMOVED Requirements

### Requirement: Root Rules manifest CLI maintenance
**Reason**: Rule 资产登记机制没有实际使用方，规则来源已收敛到组织根、项目与服务目录的 `AGENTS.md` 层级；继续维护 root Rules manifest 会形成第二套规则权威。

**Migration**: 将需要长期生效的规则正文迁移到对应作用域的 `AGENTS.md`；已有 `rules/manifest.yml` 与 `rules/*.md` 保留为可读用户资产。`buildr rules add` 与 `buildr rules remove` 返回退役诊断；需要投射时继续使用 `buildr rules render`。

## ADDED Requirements

### Requirement: Rule 资产登记机制退役
Buildr MUST 以 `AGENTS.md` 层级作为唯一当前规则来源，并 MUST 停止写入、创建或暴露 `rules/manifest.yml`、`rules add/remove` 与组件 Rule 成员；已退役资产 MUST 保留并以可迁移诊断说明，不得静默删除。

#### Scenario: 新建 workspace 不生成 Rule 资产
- **WHEN** Agent 在空目录执行 `buildr init`
- **THEN** 初始化结果 MUST NOT 包含 `rules/` 目录或 `rules/manifest.yml`
- **AND** 根 `AGENTS.md` MUST 继续包含内联核心规则的受管区块

#### Scenario: Rule manifest 命令退役
- **WHEN** Agent 执行 `buildr rules add` 或 `buildr rules remove`
- **THEN** CLI MUST 返回明确的退役诊断和迁移指引
- **AND** 命令 MUST NOT 创建、修改或删除任何规则文件或 manifest
- **AND** `buildr rules render` MUST 继续按 `AGENTS.md` 发现计划工作

#### Scenario: 已有 Rules 资产保留
- **WHEN** 已有 workspace 包含 `rules/manifest.yml` 或 `rules/*.md`
- **THEN** Buildr MUST NOT 删除、移动或改写这些文件
- **AND** doctor MUST 报告 warning，说明规则正文需迁移到相应 `AGENTS.md`
- **AND** 该 warning MUST NOT 阻断其他诊断、准备或已授权工作

#### Scenario: Agent 读取规则
- **WHEN** Agent 进入 Buildr workspace scope 并准备执行工作
- **THEN** Agent MUST 读取从组织根到当前目标路径之间所有存在的 `AGENTS.md`
- **AND** Agent MUST 按由宽到窄的顺序应用这些规则，并且 MUST NOT 读取不相关兄弟目录的规则
- **AND** Agent MUST NOT 要求或依赖 `rules/manifest.yml`
