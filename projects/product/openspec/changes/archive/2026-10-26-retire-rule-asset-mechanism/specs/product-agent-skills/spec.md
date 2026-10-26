## MODIFIED Requirements

### Requirement: Rule 与 Skill 语义边界
Buildr Skill MUST 按 asset semantics 定义 Rules 与 Skills，而不是按它们是否总会被加载定义，并且 MUST 说明规则由 `AGENTS.md` 层级承载、不再存在 Rule manifest state。

#### Scenario: 解释 Rule 与 Skill
- **WHEN** 用户询问 Rules 与 Skills 的区别
- **THEN** Buildr Skill MUST explain that Rules control Agent values, boundaries, and constraints
- **AND** Buildr Skill MUST explain that Skills encapsulate reusable professional actions and procedures
- **AND** Buildr Skill MUST NOT define the primary distinction as whether the artifact is required or lazily loaded

#### Scenario: Agent 判断相关 Rules
- **WHEN** Agent works on a task that may touch user-managed Rules
- **THEN** Buildr Skill MUST require Agent to read applicable `AGENTS.md` from the organization root through the current target path
- **AND** Buildr Skill MUST require Agent to use user goals, files being changed, code semantics, and workspace context to decide whether a deeper scope `AGENTS.md` is relevant
- **AND** Buildr Skill MUST NOT require users to preconfigure roles, paths, service names, or other routing tables for Rules relevance

#### Scenario: 解释 Rule manifest 状态
- **WHEN** 用户或 Agent 询问规则何时加载
- **THEN** Buildr Skill MUST explain that Agent reads every applicable `AGENTS.md` on the ancestor chain before acting
- **AND** Buildr Skill MUST explain that broader scope is applied before more specific scope and unrelated sibling directories are not read
- **AND** Buildr Skill MUST explain that `rules/manifest.yml`、enabled、required、state 和 description 索引已退役并不得参与当前任务
- **AND** Buildr Skill MUST distinguish runtime source discovery from Agent semantic relevance judgment

#### Scenario: Git 提交规则与技能边界
- **WHEN** Buildr Skill explains where Git commit guidance belongs
- **THEN** reusable Conventional Commits format、type selection and message generation procedure MUST belong to the Git operations Skill
- **AND** Buildr default commit language MUST belong to required Core so it remains independent of the Git operations Skill lifecycle
- **AND** more specific Project、Service or repository `AGENTS.md` rules MUST be allowed to override the Core language default

### Requirement: Buildr 技能引导工具型资产维护
Buildr 内置技能 MUST 引导 Agent 使用 Buildr 源资产维护 `AGENTS.md` 规则、技能和命令行工具清单，并区分源资产维护与运行环境投射。

#### Scenario: 维护规则
- **WHEN** 用户要求新增、修改或删除需要沉淀或复用的组织根、项目或服务规则
- **THEN** Buildr 技能 MUST 引导 Agent 直接维护对应作用域目录的 `AGENTS.md` 正文
- **AND** Buildr 技能 MUST 保留 Buildr 受管区块所有权和用户正文
- **AND** Buildr 技能 MUST NOT 引导 Agent 使用 `rules add/remove` 或维护 `rules/manifest.yml`
- **AND** Buildr 技能 MUST 引导 Agent 在需要时运行 doctor、runtime check 或 rules render

#### Scenario: 维护技能
- **WHEN** 用户要求新增、修改或删除需要沉淀或复用的技能
- **THEN** Buildr 技能 MUST 引导 Agent 先判断该技能是本地作者型 Skill 还是远端发布型 Skill
- **AND** 对于本地作者型 Skill，Buildr 技能 MUST 引导 Agent 使用 `skills add --source` 装载或登记完整 Skill 源目录
- **AND** 对于远端发布型 Skill，Buildr 技能 MUST 引导 Agent 使用 `skills add --remote-source` 登记来源
- **AND** 当 Agent 能从远端 source 中解析出精确安装源时，Buildr 技能 MUST 引导 Agent 使用 `skills add --resolved-source` 精确维护安装信息
- **AND** Buildr 技能 MUST 引导 Agent 按当前 Agent runtime 能力运行对应 render 或 runtime check

#### Scenario: 从零创建技能内容
- **WHEN** 用户要求从零设计一个新 Skill
- **THEN** Buildr 技能 MUST 引导 Agent 直接在 workspace `skills/<skill-id>/SKILL.md` 和配套目录中维护源内容
- **AND** Buildr 技能 MUST 在内容完成后引导 Agent 使用 `skills add --source skills/<skill-id>` 登记到 workspace manifest
- **AND** Buildr 技能 MUST NOT 将 `skills add` 描述为自动生成高质量 Skill 内容的命令

#### Scenario: 登记远端信息源
- **WHEN** 用户提供一个可能包含 Skill 的网页、README、GitHub 页面、registry 页面或其他 URL
- **THEN** Buildr 技能 MUST 引导 Agent 先用 `skills add --remote-source` 登记该 source
- **AND** Buildr 技能 MUST NOT 假设该 source 是可直接安装的 Skill 包

#### Scenario: 解析远端信息源
- **WHEN** Agent 从远端 source 中识别出 raw `SKILL.md` 或当前 CLI 已支持的其他精确安装源
- **THEN** Buildr 技能 MUST 引导 Agent 使用 `skills add --resolved-source --replace` 更新对应 manifest 条目
- **AND** 当可获得 version 或 integrity 时 Buildr 技能 MUST 引导 Agent 一并登记

#### Scenario: 维护命令行工具清单
- **WHEN** 用户要求组织使用某个外部命令行工具且该需求需要沉淀或复用
- **THEN** Buildr 技能 MUST 引导 Agent 使用 `commands add/remove` 维护 `commands/manifest.yml`
- **AND** Buildr 技能 MUST 引导 Agent 运行 `commands check` 或 `doctor --json`

#### Scenario: 区分产品内置技能安装和 workspace 技能维护
- **WHEN** Agent 需要安装或修复 Buildr 产品内置技能
- **THEN** Buildr 技能 MUST 引导 Agent 使用 `buildr skill install <agent>`
- **AND** Buildr 技能 MUST NOT 将 `buildr skill install <agent>` 描述为新增、装载或维护 workspace 技能的入口

#### Scenario: 本机缺少命令行工具
- **WHEN** 命令行工具清单检查报告本机缺少命令或版本不满足要求
- **THEN** Buildr 技能 MUST 引导 Agent 根据清单中的 `installHint` 向用户说明差异
- **AND** Buildr 技能 MUST NOT 要求 Buildr 自动安装该命令行工具

#### Scenario: Agent runtime 找不到 workspace 技能
- **WHEN** 当前 Agent runtime 找不到用户所需技能
- **THEN** Buildr 技能 MUST 引导 Agent 先检查 workspace Skills manifest、source / resolved 状态、Project capability/applicability context 和 runtime destination 状态
- **AND** 当 manifest 条目存在但 runtime 未同步或已过期时，Buildr 技能 MUST 引导 Agent 按当前 adapter 执行 Skills render 或 runtime check
- **AND** 当源资产不存在且该技能需要沉淀复用时，Buildr 技能 MUST 引导 Agent 先维护 workspace Skills 源资产
- **AND** Buildr 技能 MUST NOT 引导 Agent 直接把 Agent runtime 目录或 Project 目录当作源资产维护

#### Scenario: 本机找不到未声明的命令行工具
- **WHEN** 本机找不到用户所需命令行工具，且命令行工具清单没有对应组织声明
- **THEN** Buildr 技能 MUST 引导 Agent 判断该工具是否需要组织复用
- **AND** 当需要组织复用时，Buildr 技能 MUST 引导 Agent 先用 `commands add` 登记源资产，再运行 `commands check`
- **AND** 当只需一次性本机操作时，Buildr 技能 MUST NOT 要求写入 Buildr 命令行工具清单
