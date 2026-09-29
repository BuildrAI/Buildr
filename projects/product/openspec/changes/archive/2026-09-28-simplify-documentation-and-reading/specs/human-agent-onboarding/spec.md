## MODIFIED Requirements

### Requirement: 自然语言触发 Buildr onboarding
Buildr MVP MUST 支持用户通过自然语言向 Agent 表达使用 Buildr 管理项目的意图，并由 Agent 在 Buildr Skill 可用时按 Skill 完成后续引导；当技能（Skill）不可用时，智能体（Agent）MUST 能通过当前命令帮助和命令参考定位初始化或恢复入口。

#### Scenario: 用户请求使用 Buildr
- **WHEN** 用户在一个目录中向 Agent 表达“使用 Buildr 作为项目管理框架”或等价意图
- **THEN** Agent MUST 识别该意图并在 Buildr Skill 可用时使用 Buildr Skill
- **AND** 当 Buildr Skill 不可用时，智能体（Agent）MUST 按当前 `buildr help init`、`buildr help skill install` 和命令参考恢复入口，MUST NOT 要求用户先记忆或手动输入一组命令

#### Scenario: Agent 确认 workspace 根目录
- **WHEN** 当前目录尚未初始化为 Buildr workspace
- **THEN** 智能体（Agent）MUST 核对目标根目录；用户已经明确的目录与授权继续有效，仅在目标有歧义时请求确认

### Requirement: Onboarding 采用 Agent-first 协作入口
Buildr onboarding MUST 优先让 Agent 读取产品入口、识别自身 runtime、理解用户目标并引导后续动作；人类用户 MUST 能通过表达目标开始使用 Buildr，而不需要先学习完整资产模型或 CLI 命令。

#### Scenario: 人通过 Agent 开始使用 Buildr
- **WHEN** 用户向 supported Agent 表达组织项目、共享工作资产或准备 Agent 工作环境的目标
- **THEN** Agent MUST 使用 Buildr 技能（Skill）或当前命令帮助及命令参考 理解并推进 onboarding
- **AND** Agent MUST 仅在需要业务判断、重要决策或风险确认时要求用户参与

### Requirement: MVP 先通过 Buildr Skill 和基础命令闭环
Buildr MVP MUST 通过 Buildr 技能（Skill）、当前命令帮助、带智能体（Agent）身份的 `init`、全局 `assets` 登记与关联、`doctor` 和按 Agent 类型选择的 runtime 动作完成 onboarding 闭环，不得要求先实现 `buildr use` 等额外入口。

#### Scenario: Agent 获取 Buildr 使用指南
- **WHEN** Agent 通过 README、安装说明、`buildr --help` 或本地 CLI 发现 Buildr，但当前 workspace 尚未初始化且当前 runtime adapter 已确认
- **THEN** Agent MUST 优先使用 `buildr init --agent <agent>` 初始化 workspace 并安装产品 Buildr Skill
- **AND** 当 Buildr Skill 仍不可用时，智能体（Agent）MUST 能通过 `buildr help skill install` 修复产品入口，通过命令参考定位安装、初始化、同步和恢复；MUST NOT 依赖另一个输出指南正文的命令

#### Scenario: Agent 使用 Buildr Skill
- **WHEN** 当前 Agent runtime 已安装 Buildr Skill
- **THEN** Agent MUST 通过 Buildr Skill 理解 Buildr workspace onboarding、项目创建、服务接入、诊断和 runtime 处理约束
- **AND** Buildr 技能（Skill）MUST 以目标、边界和按需引用引导智能体（Agent）自主组合动作，而不是规定固定交互脚本

#### Scenario: service create 维护服务资产
- **WHEN** Agent 需要创建或维护 service metadata 与 service repo 引用
- **THEN** 智能体（Agent）MUST 先通过 `buildr assets inspect` 核对当前对象、版本与迁移状态，并使用 `assets create service`、`assets update` 或 `assets associate` 完成明确的登记及关联
- **AND** 旧 `service create` MUST 只作为未迁移工作空间（Workspace）的兼容入口，MUST NOT 作为新用户主路径

#### Scenario: 共享服务创建项目
- **WHEN** 用户希望接入共享、基础或平台 service repo
- **THEN** 智能体（Agent）MUST 核对服务（Service）与代码库实例（Repository Instance），仅在用户需要项目（Project）组成时创建或关联项目（Project）；同一服务（Service）MAY 被多个项目（Project）引用
- **AND** Agent MUST NOT 引导用户维护 root `shared/`

#### Scenario: 渐进式引导项目和服务
- **WHEN** Agent 完成 `buildr init --agent <agent>` 或其他 Buildr 状态变更
- **THEN** Agent MUST 基于该命令的最终 doctor 结果和用户回答，逐步引导创建项目、接入 service repo 和执行必要的 runtime 维护

#### Scenario: Agent 根据自身 runtime 选择动作
- **WHEN** Agent 准备执行 `buildr init --agent <agent>`
- **THEN** 当前命令参考和 Buildr 技能（Skill）MUST 引导智能体（Agent）先确认自身运行时适配器（Runtime Adapter）
- **AND** 对原生读取 `AGENTS.md` 的 Agent MUST NOT 要求执行独立 rules render

#### Scenario: Codex 使用 Buildr workspace
- **WHEN** Codex Agent 在 Buildr workspace 中工作
- **THEN** Agent MUST 直接使用 `AGENTS.md` 作为规则入口
- **AND** Agent MUST NOT 为规则入口执行 `buildr rules render claude-code`

#### Scenario: Claude Code 使用 Buildr workspace
- **WHEN** Claude Code Agent 在 Buildr workspace 中工作
- **THEN** Agent MUST 使用 Claude Code adapter 的 runtime check/render 来维护 `CLAUDE.md` 和 `.claude/skills/`

#### Scenario: 纯源资产初始化保持兼容
- **WHEN** Agent 执行不带 `--agent` 的 `buildr init`
- **THEN** Buildr MUST 只创建 Buildr workspace 源资产
- **AND** Buildr MUST NOT 自动渲染 Buildr Skill、`CLAUDE.md` 或其他 Agent runtime 文件

#### Scenario: 高层初始化准备当前 Agent runtime
- **WHEN** Agent 执行 `buildr init --agent <agent> --target <dir>`
- **THEN** Buildr MUST 在创建 workspace 源资产后执行等价于 `buildr sync <agent> --target <dir>` 的完整 reconcile
- **AND** Buildr MUST 以指定 Agent 的最终 doctor 通过作为 onboarding 完成条件
- **AND** Agent MUST NOT 需要再执行独立的 `skill install`、`render`、`sync` 或 `doctor` 才完成首次 onboarding

#### Scenario: 高层初始化参数预检
- **WHEN** `buildr init --agent <agent>` 收到不支持或无效的 Agent id
- **THEN** Buildr MUST 在写入 workspace 源资产或 Agent runtime 前失败
- **AND** Buildr MUST 输出 supported runtime guidance

#### Scenario: 高层初始化 sync 失败
- **WHEN** workspace 源资产已经初始化，但 `init --agent` 的后续 sync 或 doctor 未通过
- **THEN** Buildr MUST 保留已初始化的 workspace 源资产
- **AND** Buildr MUST NOT 报告 onboarding 成功
- **AND** Buildr MUST 引导 Agent 修复问题后运行 `buildr sync <agent> --target <dir>`

#### Scenario: 产品 Skill 安装不同于 workspace Skills 投射
- **WHEN** Agent 只需要让当前 runtime 学会使用 Buildr
- **THEN** Agent MUST 使用 `buildr skill install <agent>`
- **AND** 当 Agent 需要投射 workspace Skills 时，Agent MUST 使用 `buildr skills render <agent> --destination workspace|user`
- **AND** Project 专用语义 MUST 通过 `capabilities.yml` 表达而不是建立 Skill source scope

#### Scenario: 讨论其他更高层入口
- **WHEN** 需要评估 `buildr use` 等其他更高层入口
- **THEN** 该能力 MUST 在 `init --agent` onboarding 效果被验证后再单独设计

### Requirement: onboarding 引导 Agent 使用工具型资产规则
Buildr onboarding MUST 引导 Agent 通过 Buildr 技能和默认规则维护规则、技能和命令行工具清单。

#### Scenario: Agent 安装 Buildr 技能后继续初始化
- **WHEN** Agent 已安装或可使用 Buildr 技能
- **THEN** onboarding MUST 引导 Agent 按 Buildr 技能使用 Buildr CLI 初始化 workspace、检查状态并维护需要沉淀或复用的资产

#### Scenario: Agent 遇到命令行工具需求
- **WHEN** onboarding 或后续协作中出现需要沉淀或复用的命令行工具需求
- **THEN** Agent MUST 将该需求登记到 Buildr 命令行工具清单
- **AND** Agent MUST 通过 `commands check` 或 doctor 判断当前本机环境是否满足声明

#### Scenario: Buildr 技能不可用
- **WHEN** 当前 Agent 无法使用 Buildr 技能
- **THEN** 上手说明 MUST 引导智能体（Agent）通过当前命令帮助执行 `buildr skill install <agent>` 修复产品入口，或按命令参考执行明确的初始化及同步
- **AND** 命令参考与已安装技能（Skill）MUST 说明先维护长期源资产，再按需投射到运行时（Runtime）；本机环境和一次执行状态不成为源资产

### Requirement: Agent selects runtime adapter before render
Buildr onboarding MUST 引导 Agent 在运行 runtime render、sync、skill install 或 runtime check 命令前，先识别自身 runtime，并与 Buildr supported runtime adapter list 对比。

#### Scenario: Agent discovers supported runtimes
- **WHEN** Agent 开始 Buildr onboarding 或 runtime maintenance
- **THEN** Agent MUST 在 runtime-specific Buildr commands 前运行或依赖 `buildr runtime list --json`
- **AND** Agent MUST 在运行 runtime-specific commands 前选择与自身 runtime 匹配的 adapter id

#### Scenario: Supported Agent uses matching adapter
- **WHEN** Agent 确认自己是 supported runtime
- **THEN** Agent MUST 将匹配的 `<agent>` 值传给 Buildr runtime-specific commands
- **AND** Agent MUST 在 runtime identity 已知后使用 `doctor --agent <agent>` 进行 onboarding diagnostics

#### Scenario: Agent cannot identify itself
- **WHEN** Agent 无法可靠识别自身 runtime
- **THEN** Agent MUST NOT 构造 `unknown`、`generic` 或其他 placeholder Agent id
- **AND** Agent MUST NOT 运行 runtime render、sync、skill install 或 runtime check commands
- **AND** 智能体（Agent）MUST 仅暂停依赖未确认运行时（Runtime）的动作，MAY 继续已授权且不依赖该运行时（Runtime）的读取和源资产维护
- **AND** Agent MUST 告诉用户当前 Agent runtime identity 尚未确认，并请联系 Buildr 作者反馈该 Agent

#### Scenario: Unsupported Agent warns instead of rendering
- **WHEN** Agent 确认自己是 unsupported runtime
- **THEN** Agent MUST 警示用户 Buildr 暂不支持当前 Agent 的自动渲染
- **AND** Agent MUST NOT 使用猜测的 adapter id 执行 render、sync、skill install 或 runtime check
- **AND** Agent MUST NOT 使用 supported fallback adapter 代替
- **AND** Agent MUST 告诉用户联系 Buildr 作者反馈该 Agent

### Requirement: Buildr onboarding guidance 覆盖新增 adapters
Buildr 技能（Skill）、命令参考（CLI Reference）和当前知识 MUST 将新增 supported adapters 与其 runtime-specific 前置条件纳入 Agent onboarding，同时继续以 `runtime list` 作为事实源。

#### Scenario: Agent 选择新增 adapter
- **WHEN** Agent 识别自身为 Cursor、Qoder、TRAE、TRAE Work 或 WorkBuddy 的已认证 surface
- **THEN** onboarding guidance MUST 要求 Agent 从 `runtime list --json` 选择 `cursor`、`qoder`、`trae`、`trae-work` 或 `workbuddy`
- **AND** Agent MUST 使用匹配 adapter 的命令，不得借用同品牌其他 surface 或其他 supported adapter

#### Scenario: 接入后仍需人工动作
- **WHEN** sync 或 render 已完成但 runtime check 报告 reload、新会话、UI toggle 或真实引用读取待确认
- **THEN** Agent MUST 向用户说明剩余动作及其原因
- **AND** Agent MUST NOT 把仅完成文件投射描述为当前 Agent 会话已经可用

### Requirement: `init --agent` 完成后必须提供首次使用交接
Buildr onboarding MUST 将成功的技术初始化转换为普通用户可理解的首次使用交接。Agent MUST 基于最终 doctor 和真实 Project/Service 状态解释工作空间（Workspace）、项目（Project）、服务（Service）与代码库实例（Repository Instance）的关系，并只引导当前必要的下一步；CLI 成功输出 MUST NOT 把要求用户手动执行 Project/Service 命令作为默认结果。

#### Scenario: 初始化后没有 Project
- **WHEN** `buildr init --agent <agent>` 的最终 doctor 通过且当前 Workspace 没有 Project
- **THEN** 智能体（Agent）MUST 用普通语言说明工作空间（Workspace）承载共同事实、项目（Project）承载业务目标、服务（Service）承担实现职责、代码库实例（Repository Instance）定位实际代码
- **AND** MUST 询问用户希望管理的业务、产品、系统、长期工作或已有 repo
- **AND** MUST NOT 首先讲解 Rules、Skills、Commands、runtime adapter 或要求用户执行 `project create`

#### Scenario: 初始化后 Project 没有 Service
- **WHEN** Workspace 中存在唯一可确认 Project，但该 Project 没有 Service
- **THEN** Agent MUST 说明 Service 只在存在代码仓、应用、模块或可执行资产时需要
- **AND** MUST 询问用户是接入已有资产还是直接开始 Project-scoped 工作
- **AND** MUST NOT 将 Service 作为 onboarding 完成的强制条件

#### Scenario: 初始化后存在唯一工作范围
- **WHEN** Workspace 中存在唯一可确认 Project 和唯一可确认 Service
- **THEN** Agent MUST 简短说明已识别的 Workspace、Project 与 Service
- **AND** MUST 邀请用户直接描述第一项工作目标
- **AND** MUST NOT 为已经唯一的范围重复要求用户填写 code、path 或 Git 声明

#### Scenario: 初始化后存在多个候选范围
- **WHEN** Workspace 中存在多个可能的 Project 或当前 Project 中存在多个可能的 Service
- **THEN** Agent MUST 只询问足以消除当前工作范围歧义的最少问题
- **AND** MUST NOT 根据排序、最近修改或第一个条目静默选择业务范围

#### Scenario: runtime 仍需要人工激活
- **WHEN** init/sync 已完成文件投射但当前 adapter 仍要求 reload、新会话或 UI toggle
- **THEN** Agent MUST 先说明剩余动作和原因
- **AND** MUST NOT 把文件已生成描述为当前会话已经可以使用新资产

#### Scenario: onboarding 不生成长期欢迎文件
- **WHEN** Buildr 完成首次初始化或首次教学
- **THEN** Buildr MUST NOT 创建 `WELCOME.md`、持久化 onboarding checklist 或把固定教学写入每次会话 required Rule
- **AND** 后续 Agent MUST 继续从真实 Workspace、Project、Service 与 runtime 状态判断是否需要引导
