# human-agent-onboarding Specification

## Purpose
定义 Buildr MVP 的用户与 Agent 协作 onboarding 行为：用户用自然语言触发，Agent 在 Buildr Skill 可用时使用它，并通过基础 CLI 命令完成最小闭环；当 Skill 不可用时，bootstrap guide 提供兜底路径。
## Requirements

### Requirement: 自然语言触发 Buildr onboarding
Buildr MVP MUST 支持用户通过自然语言向 Agent 表达使用 Buildr 管理项目的意图，并由 Agent 在 Buildr Skill 可用时按 Skill 完成后续引导；当 Skill 不可用时，Agent MUST 能按 bootstrap guide 兜底。

#### Scenario: 用户请求使用 Buildr
- **WHEN** 用户在一个目录中向 Agent 表达“使用 Buildr 作为项目管理框架”或等价意图
- **THEN** Agent MUST 识别该意图并在 Buildr Skill 可用时使用 Buildr Skill
- **AND** 当 Buildr Skill 不可用时，Agent MUST 读取 Buildr bootstrap guide，而不是要求用户先记忆或手动输入一组 Buildr CLI 命令

#### Scenario: Agent 确认 workspace 根目录
- **WHEN** 当前目录尚未初始化为 Buildr workspace
- **THEN** Agent MUST 与用户确认是否将当前目录作为 Buildr workspace 根目录

### Requirement: Onboarding 采用 Agent-first 协作入口
Buildr onboarding MUST 优先让 Agent 读取产品入口、识别自身 runtime、理解用户目标并引导后续动作；人类用户 MUST 能通过表达目标开始使用 Buildr，而不需要先学习完整资产模型或 CLI 命令。

#### Scenario: 人通过 Agent 开始使用 Buildr
- **WHEN** 用户向 supported Agent 表达组织项目、共享工作资产或准备 Agent 工作环境的目标
- **THEN** Agent MUST 使用 Buildr Skill 或 bootstrap guide 理解并推进 onboarding
- **AND** Agent MUST 仅在需要业务判断、重要决策或风险确认时要求用户参与

### Requirement: Agent 使用 CLI 作为确定性执行层
Buildr MVP MUST 将 CLI 作为 Agent 执行用户意图的 hard constraint 层。

#### Scenario: Agent 执行初始化
- **WHEN** 用户确认使用当前目录作为 Buildr workspace
- **THEN** Agent MUST 通过 `buildr init` 或等价可验证命令初始化 workspace

#### Scenario: Agent 汇报执行动作
- **WHEN** Agent 即将执行会改变 Buildr workspace 的命令
- **THEN** Agent MUST 向用户说明将执行的 Buildr 动作和预期资产变化

### Requirement: MVP 先通过 Buildr Skill 和基础命令闭环
Buildr MVP MUST 通过 Buildr Skill、bootstrap guide 兜底、带 Agent identity 的高层 `init`、`project create`、`service create`、`doctor` 和按 Agent 类型选择的 runtime 动作完成 onboarding 闭环，不得要求先实现 `buildr use` 等额外入口。

#### Scenario: Agent 获取 Buildr 使用指南
- **WHEN** Agent 通过 README、安装说明、`buildr --help` 或本地 CLI 发现 Buildr，但当前 workspace 尚未初始化且当前 runtime adapter 已确认
- **THEN** Agent MUST 优先使用 `buildr init --agent <agent>` 初始化 workspace 并安装产品 Buildr Skill
- **AND** 当 Buildr Skill 仍不可用时，Agent MUST 能通过 `buildr bootstrap guide` 理解基础命令和 onboarding 兜底路径

#### Scenario: Agent 使用 Buildr Skill
- **WHEN** 当前 Agent runtime 已安装 Buildr Skill
- **THEN** Agent MUST 通过 Buildr Skill 理解 Buildr workspace onboarding、项目创建、服务接入、诊断和 runtime 处理约束
- **AND** Buildr Skill MUST 以轻约束和命令地图引导 Agent 自主编排，而不是规定固定交互脚本

#### Scenario: service create 维护服务资产
- **WHEN** Agent 需要创建或维护 service metadata 与 service repo 引用
- **THEN** Agent MUST 使用 `buildr service create`
- **AND** bootstrap guide MUST NOT 将 `service link` 描述为主命令

#### Scenario: 共享服务创建项目
- **WHEN** 用户希望接入共享、基础或平台 service repo
- **THEN** Agent MUST 引导用户选择或创建一个 Project 来承载这些 services
- **AND** Agent MUST NOT 引导用户维护 root `shared/`

#### Scenario: 渐进式引导项目和服务
- **WHEN** Agent 完成 `buildr init --agent <agent>` 或其他 Buildr 状态变更
- **THEN** Agent MUST 基于该命令的最终 doctor 结果和用户回答，逐步引导创建项目、接入 service repo 和执行必要的 runtime 维护

#### Scenario: Agent 根据自身 runtime 选择动作
- **WHEN** Agent 准备执行 `buildr init --agent <agent>`
- **THEN** bootstrap guide 和 Buildr Skill MUST 引导 Agent 先确认自身 runtime adapter
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
- **THEN** onboarding MUST 引导 Agent 运行 `buildr bootstrap guide`
- **AND** bootstrap guide MUST 说明规则、技能、命令行工具等需要沉淀或复用的资产应先维护到 Buildr 源资产，再按需同步到 Agent 运行环境或本机

### Requirement: onboarding supports Project registry and Project asset repos
Buildr onboarding MUST 引导 Agent 和用户完成 Project registry maintenance 与 independent Project asset repo creation。

#### Scenario: Agent creates a Project
- **WHEN** user asks Agent to create a Project in a Buildr workspace
- **THEN** Agent MUST use `buildr project create <project>`
- **AND** Agent MUST expect the command to maintain both `projects/<project>/` and `projects/manifest.yml`

#### Scenario: Agent records concise Project identity
- **WHEN** Agent creates a Project and the user provides a human-readable title or short description
- **THEN** Agent MUST pass that information through Project creation or registry repair
- **AND** Agent MUST NOT treat the registry description as a replacement for Project OpenSpec knowledge or specs

#### Scenario: 用户提供 Project 资产 Git repo
- **WHEN** user provides a Git repo intended to store Project memory, rules, OpenSpec, Skills or docs
- **THEN** Agent MUST treat it as a Project asset repo rather than a service repo
- **AND** Agent MUST use `buildr project create <project> --repo <git-url>`

#### Scenario: 用户提供本地 Project 资产目录
- **WHEN** user provides a local directory intended to become a Project asset repo
- **THEN** Agent MUST NOT register that directory as an external Project link
- **AND** Agent MUST guide the user to materialize the Project assets under `projects/<project>/`

#### Scenario: Agent uses doctor after Project changes
- **WHEN** Agent creates or repairs a Project
- **THEN** Agent MUST run or rely on `buildr doctor --agent <agent> --json` after runtime identity is known to inspect Project registry, Project baseline and Project repo state

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
- **AND** Agent MUST NOT 继续执行 Buildr workspace 维护命令
- **AND** Agent MUST 告诉用户当前 Agent runtime identity 尚未确认，并请联系 Buildr 作者反馈该 Agent

#### Scenario: Unsupported Agent warns instead of rendering
- **WHEN** Agent 确认自己是 unsupported runtime
- **THEN** Agent MUST 警示用户 Buildr 暂不支持当前 Agent 的自动渲染
- **AND** Agent MUST NOT 使用猜测的 adapter id 执行 render、sync、skill install 或 runtime check
- **AND** Agent MUST NOT 使用 supported fallback adapter 代替
- **AND** Agent MUST 告诉用户联系 Buildr 作者反馈该 Agent

### Requirement: Buildr Skill uses runtime discovery in its main loop
Buildr product Skill MUST 将 runtime adapter discovery 作为主执行循环的一部分。

#### Scenario: Buildr Skill runtime selection
- **WHEN** Agent 使用 Buildr product Skill 维护 Buildr workspace
- **THEN** Skill MUST 要求 Agent 在 runtime-specific commands 前检查 `buildr runtime list --json`
- **AND** Skill MUST 要求 Agent 在 Agent identity 已知后使用 `buildr doctor --agent <agent> --target <dir> --json`
- **AND** Skill MUST 要求 Agent 不为 unsupported Agent runtime 使用 fallback adapters

### Requirement: CLI help is useful and safe for Agent exploration
Buildr CLI help MUST 对 Agent exploration 有用且安全，并且 MUST NOT 执行 state-changing actions。

#### Scenario: All supported commands expose help
- **WHEN** Agent runs `--help` for any supported Buildr command or nested subcommand
- **THEN** Buildr MUST output non-empty help that names the requested command or subcommand
- **AND** Buildr MUST exit successfully
- **AND** Buildr MUST NOT perform state-changing actions

#### Scenario: Subcommand help has no side effects
- **WHEN** Agent runs `buildr init --help`
- **THEN** Buildr MUST output help for `init`
- **AND** Buildr MUST NOT initialize the target directory
- **AND** Buildr MUST exit successfully

#### Scenario: Nested subcommand help has no side effects
- **WHEN** Agent runs `buildr project create --help`
- **THEN** Buildr MUST output help for `project create`
- **AND** Buildr MUST NOT create or repair any Project
- **AND** Buildr MUST exit successfully

#### Scenario: Runtime list help has no side effects
- **WHEN** Agent runs `buildr runtime list --help`
- **THEN** Buildr MUST output help for `runtime list`
- **AND** Buildr MUST NOT require a Buildr workspace
- **AND** Buildr MUST exit successfully

### Requirement: 开发仓库安装必须形成 Agent 可用闭环
Buildr MUST 提供与当前仓库结构一致的开发 checkout 安装路径，并提供 registry package 安装路径，使 Agent 在没有预装 Buildr Skill 的环境中能够准备 CLI，再用单个高层初始化命令完成 workspace 源资产、当前 runtime 和诊断闭环。

#### Scenario: Agent 从干净开发仓库开始
- **WHEN** Agent 在 Buildr 仓库的干净 clone 中按根 README 安装 Buildr
- **THEN** 安装说明 MUST 使用仓库中真实存在的产品目录和安装脚本
- **AND** 安装流程 MUST 确定性准备 lockfile 声明的运行依赖
- **AND** Agent MUST 能运行 `buildr runtime list --json`

#### Scenario: Agent 从 registry package 开始
- **WHEN** Agent 在没有 Buildr checkout 的环境中按根 README 安装 Buildr
- **THEN** 安装说明 MUST 使用发布的 npm package identity 和支持的 registry 安装方式
- **AND** Agent MUST 能运行 `buildr runtime list --json`

#### Scenario: Agent 完成首次 runtime 准备
- **WHEN** CLI 已从开发 checkout 或已安装 npm package 可用，且 Agent 已从 supported runtime list 选择自身 adapter
- **THEN** 公开 onboarding MUST 引导 Agent 运行 `buildr init --agent <agent>`
- **AND** 该单个命令 MUST 创建源资产、安装产品 Buildr Skill、投射 workspace Skills 并运行最终 doctor
- **AND** 最终 doctor MUST 不包含需要立即处理的 error

#### Scenario: 两种安装模式回归验证
- **WHEN** 产品完整验证运行 onboarding smoke tests
- **THEN** verifier MUST 分别覆盖不包含 `node_modules` 和 Agent runtime 产物的临时开发 checkout，以及从 npm package 安装的临时 prefix
- **AND** 两种模式 MUST 都能从公开安装入口运行 `buildr runtime list --json` 并仅用 `buildr init --agent <agent>` 完成 workspace/runtime onboarding
- **AND** verifier MUST 独立读取 doctor JSON 证明最终状态可用

### Requirement: 公开 README 统一产品入口与两种模式
Buildr MUST 以 workspace 根 README 作为公开产品入口，并分别说明开发 checkout 与 registry package 两种快速开始和更新模式。

#### Scenario: 根 README 介绍 Buildr 产品
- **WHEN** 用户或 Agent 从仓库根 README 了解 Buildr
- **THEN** README MUST 先说明 Buildr 产品定位、核心模型、快速开始、主要能力和文档入口
- **AND** README MUST 在产品说明之后再说明该仓库同时是 Buildr 自举 workspace

#### Scenario: 两种快速开始
- **WHEN** README 提供 Buildr 安装说明
- **THEN** README MUST 分别提供开发 checkout 安装和 registry package 安装路径
- **AND** 两种路径 MUST 汇合到 runtime discovery 与 `buildr init --agent <agent>` onboarding

#### Scenario: 不重复维护 Product README
- **WHEN** 根 README 已承载公开产品说明
- **THEN** Product Project MUST NOT 继续维护内容重复的独立产品 README
- **AND** 仓内文档链接 MUST 指向根 README 或对应权威产品文档

### Requirement: 公开文档提供已接入 Agent adapter 权威说明
Buildr MUST 维护一份可由人和 Agent 从根 README 发现的已接入 Agent runtime adapter 权威文档，并使其与 `buildr runtime list --json` 的 supported adapter 事实一致。

#### Scenario: README 引用 adapter 文档
- **WHEN** 用户或 Agent 阅读根 `README.md` 或 `README.en.md` 的当前支持摘要或文档导航
- **THEN** README MUST 链接已接入 Agent adapter 权威文档
- **AND** README MUST 引导 Agent 使用 `buildr runtime list --json` 获取当前机器可读事实矩阵
- **AND** README MUST NOT 复制一份容易与权威文档漂移的完整 adapter 机制表

#### Scenario: Adapter 文档说明接入方式
- **WHEN** 用户或 Agent 阅读已接入 Agent adapter 权威文档
- **THEN** 文档 MUST 对每个 supported adapter 说明 adapter id、适用 surface、Rules 入口与生成 target、Skills root、activation/reload、checker、前置条件和已知限制
- **AND** 文档 MUST 区分官方文档、本机观察、安装包源码和推断等兼容证据来源
- **AND** 文档 MUST 说明自动 contract/parity 只能证明 Buildr 的投射与维护边界，不能证明目标 Agent 已在当前 workspace、版本或会话加载文件
- **AND** 文档 MUST NOT 维护 `documented`/`verified`、`pending`/`passed` 或品牌历史 marker smoke 快照

#### Scenario: Agent 按文档接入当前 runtime
- **WHEN** Agent 从权威文档识别到自身 runtime 已受支持
- **THEN** 文档 MUST 引导 Agent 使用匹配的 adapter id 运行 `buildr init --agent <agent>`、`buildr sync <agent>`、`buildr runtime check <agent>` 或相应 render 命令
- **AND** 文档 MUST 提醒 Agent 按 adapter-specific guidance 完成 reload、新会话或 UI toggle
- **AND** 文档 MUST 禁止为未列出的 runtime 或 surface 使用 supported fallback adapter

### Requirement: Buildr onboarding guidance 覆盖新增 adapters
Buildr Skill、bootstrap guide、CLI Reference 和 current-state knowledge MUST 将新增 supported adapters 与其 runtime-specific 前置条件纳入 Agent onboarding，同时继续以 `runtime list` 作为事实源。

#### Scenario: Agent 选择新增 adapter
- **WHEN** Agent 识别自身为 Cursor、Qoder、TRAE、TRAE Work 或 WorkBuddy 的已认证 surface
- **THEN** onboarding guidance MUST 要求 Agent 从 `runtime list --json` 选择 `cursor`、`qoder`、`trae`、`trae-work` 或 `workbuddy`
- **AND** Agent MUST 使用匹配 adapter 的命令，不得借用同品牌其他 surface 或其他 supported adapter

#### Scenario: 接入后仍需人工动作
- **WHEN** sync 或 render 已完成但 runtime check 报告 reload、新会话、UI toggle 或真实引用读取待确认
- **THEN** Agent MUST 向用户说明剩余动作及其原因
- **AND** Agent MUST NOT 把仅完成文件投射描述为当前 Agent 会话已经可用

### Requirement: Onboarding 区分 Skill source authority 与 render destination
Buildr onboarding guidance MUST 说明 workspace 是唯一 Skill source authority，并 MUST 将 user/workspace destination 解释为 Agent runtime 投射位置而不是 source scope。

#### Scenario: 用户要求全局安装 Skill
- **WHEN** 用户要求某个 workspace Skill 对其他工作目录也可用
- **THEN** Agent MUST 说明该 Skill 仍由当前 workspace `skills/` 维护
- **AND** MUST 取得用户级写入授权后使用 `buildr skills render <agent> --destination user`

#### Scenario: 用户要求项目专用 Skill
- **WHEN** 用户要求一个 Skill 只适用于某个 Project
- **THEN** Agent MUST 在 workspace source authority 中维护该 Skill
- **AND** MUST 在 Project `capabilities.yml` 中声明 applicability 或 binding
- **AND** MUST NOT 创建 Project Skill manifest 或隐式投射用户级 Skills

#### Scenario: Agent 询问 Project Skill
- **WHEN** 用户或旧文档使用“Project Skill”描述当前能力
- **THEN** onboarding MUST 区分 legacy Project Skill source、Project capability/applicability context 与 workspace destination
- **AND** canonical guidance MUST NOT 把 Project 描述为当前 Skill source 或安装隔离层

### Requirement: Runtime guidance 公开 Skills inventory 保证边界
Buildr guidance MUST 说明 adapter 是否能完整观察当前 Agent Skills 集，并 MUST 区分已证明冲突、未发现冲突和可见性不完整。

#### Scenario: Adapter inventory 为 partial
- **WHEN** runtime discovery 无法枚举 plugin、system 或其他 Agent 内部 Skill 来源
- **THEN** onboarding/runtime guidance MUST 报告 `partial` evidence 和受影响边界
- **AND** MUST NOT 将成功 render 描述为已证明全局唯一

### Requirement: Onboarding 区分 Command definition、requirement 与本机状态
Buildr onboarding MUST 引导 Agent 将 workspace Command catalog、Project requirements 和 user/machine environment 视为不同事实层。

#### Scenario: 用户声明组织认可工具
- **WHEN** 用户希望在 workspace 中登记可复用外部 CLI
- **THEN** Agent MUST 使用 Commands catalog 维护入口创建或更新 definition
- **AND** MUST NOT 因登记 definition 自动把所有 Projects 标记为需要该工具

#### Scenario: 用户声明 Project 需要工具
- **WHEN** 用户说明某个 Project 需要已登记 Command
- **THEN** Agent MUST 在该 Project `commands.yml` 增加 requirement reference
- **AND** MUST NOT 复制 executable、probe 或 install hint

#### Scenario: 用户要求安装工具
- **WHEN** machine observation 显示 required Command 缺失或版本不满足
- **THEN** Agent MUST 说明 requirement 来源和环境差异
- **AND** 只有取得相应授权后 MAY 协作安装或升级
- **AND** Buildr onboarding MUST NOT 声称 Commands add/check 会完成安装

### Requirement: `init --agent` 完成后必须提供首次使用交接
Buildr onboarding MUST 将成功的技术初始化转换为普通用户可理解的首次使用交接。Agent MUST 基于最终 doctor 和真实 Project/Service 状态解释 Workspace → Project → Service 最小模型，并只引导当前必要的下一步；CLI 成功输出 MUST NOT 把要求用户手动执行 Project/Service 命令作为默认结果。

#### Scenario: 初始化后没有 Project
- **WHEN** `buildr init --agent <agent>` 的最终 doctor 通过且当前 Workspace 没有 Project
- **THEN** Agent MUST 用普通语言说明 Workspace、Project 与 Service 的关系
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

### Requirement: Onboarding 必须以第一次有效工作作为用户成功条件
Buildr MUST 区分技术 onboarding 完成与用户第一次有效工作。技术 onboarding 以 Workspace、runtime 和 doctor ready 为完成条件；用户成功路径 MUST 继续让用户理解或确认工作范围，并能够向 Agent 提出第一项真实目标。

#### Scenario: 技术 onboarding 完成
- **WHEN** Workspace 源资产、当前 Agent runtime 和最终 doctor 均已准备完成
- **THEN** Buildr MAY 报告技术 onboarding 已完成
- **AND** Agent MUST 继续执行首次使用交接，除非用户已经给出明确 Project/Service 和工作目标

#### Scenario: 用户已经给出完整目标
- **WHEN** 用户最初请求中已经包含业务或产品范围、已有 repo 和第一项工作目标
- **THEN** Agent MUST 在必要授权后连续完成 init、Project/Service 接入和任务范围确认
- **AND** MUST NOT 为展示教学而中断已经明确的工作流

#### Scenario: 用户完成第一次有效工作入口
- **WHEN** 用户已确认 Project、可选 Service 并向 Agent 提出真实工作目标
- **THEN** Agent MUST 使用当前范围适用的工作资产推进任务
- **AND** Buildr onboarding MUST NOT 要求用户先掌握其他资产类型或 CLI 命令

### Requirement: Onboarding 必须提供 Buildr Web 与 Agent-only 两种一致入口
Buildr MUST 允许用户通过 Buildr Web 或直接在 Agent 对话中开始使用，并 MUST 让两种入口使用相同的 Workspace → Project → Service 心智、同一 source authority 和同一 Agent 执行边界。

#### Scenario: 用户选择 local app
- **WHEN** 用户通过 Buildr Web 添加或进入 Workspace
- **THEN** Buildr Web MUST 帮助用户理解和选择 Workspace、Project 与可选 Service
- **AND** 创建、迁移、修复和开始工作 MUST 通过可复制 Agent Action 交接给 Agent
- **AND** Buildr Web MUST NOT声称自己已经执行 Agent 的专业工作

#### Scenario: 用户只使用 Agent
- **WHEN** 用户不打开 Buildr Web 而在 supported Agent 中请求使用 Buildr
- **THEN** Agent MUST 完成 runtime discovery、init/doctor、首次教学和必要的 Project/Service 引导
- **AND** MUST NOT 要求用户为了完成 onboarding 打开 Buildr Web

#### Scenario: 用户在两种入口之间切换
- **WHEN** 用户先通过 Agent 创建或修改资产，再打开 Buildr Web，或者从 Buildr Web 复制 prompt 后回到 Agent
- **THEN** 两种入口 MUST 从同一 Workspace 源资产读取事实
- **AND** MUST NOT 维护需要双向同步的第二份 Project/Service/onboarding 状态
