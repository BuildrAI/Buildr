# product-agent-skills Specification

## Purpose
定义 Buildr 产品入口 Agent Skill、workspace Skill 源资产、Project capability/applicability context、runtime 投射和场景化工作流引导契约。
## Requirements

### Requirement: 产品内置 Agent Skills
Buildr MUST 支持面向支持 runtime 的产品内置 Agent Skills，将其作为 workspace sync 的一部分进行同步，并 MUST 通过 capability contracts 路由可替换的 workspace 专业动作。

#### Scenario: 产品内置 Buildr Skill
- **WHEN** Buildr 产品包包含 Buildr 使用 Skill
- **THEN** 该 Skill MUST 由 package 的产品入口 Skill 声明管理
- **AND** `buildr skill install <agent>`、`buildr sync <agent>` 和首次 `buildr init --agent <agent>` MUST 能够为支持的 Agent runtime 安装或修复该 Skill
- **AND** 该 Skill MUST NOT 写入 workspace 的 `skills/manifest.yml`

#### Scenario: Buildr Skill 感知 Buildr 产品入口更新意图
- **WHEN** 用户要求 Agent“更新 Buildr”“同步 Buildr”或表达明确等价意图，且没有限定只更新 CLI
- **THEN** 产品内置 Buildr Skill 的 description 和正文 MUST 将这些表达统一识别为更新 Buildr CLI 与产品入口 Buildr Skill
- **AND** Buildr Skill MUST 引导 Agent 先运行 `buildr update`
- **AND** update 成功后 Agent MUST 重新解析当前 `buildr` 入口，再运行 `buildr skill install <agent> --target <dir>`
- **AND** Agent MUST NOT 因该意图同步其他 workspace 产品能力或执行完整 workspace sync

#### Scenario: Buildr Skill 感知只更新 CLI 意图
- **WHEN** 用户明确要求“只更新 CLI”、不要安装或修复 Buildr Skill，或表达明确等价限制
- **THEN** Buildr Skill MUST 引导 Agent 只运行 `buildr update`
- **AND** Agent MUST NOT 追加 Skill install、sync、runtime render 或 workspace doctor

#### Scenario: Buildr Skill 感知 Git 管理的 workspace 同步意图
- **WHEN** 用户要求 Agent“更新 workspace”“同步 workspace”或表达明确等价意图，且 workspace root 由 Git 管理
- **THEN** Buildr Skill MUST resolve `buildr.git-operations/v1`，并把明确 workspace、upstream、update operation 与授权交给 selected provider
- **AND** Git 更新成功后 Agent MUST 直接运行 `buildr sync <agent> --target <dir>`，不得因 sync 再次询问授权
- **AND** Agent MUST NOT 先运行 `buildr update`
- **AND** Agent MUST 使用 sync 的最终 doctor 结果判断 workspace 同步是否完成

#### Scenario: Git workspace update provider 不可用
- **WHEN** `buildr.git-operations/v1` consumer readiness is `blocked`
- **THEN** Buildr Skill MUST stop before changing the checkout
- **AND** Agent MUST report the readiness reason and executable provider or binding nextActions
- **AND** Agent MUST NOT silently fall back to a removed builtin or hand-written Git route

#### Scenario: Git workspace 无法安全更新
- **WHEN** workspace Git 更新遇到本地改动、分叉、冲突、缺少 upstream 或其他需要用户决策的状态
- **THEN** Agent MUST 停止并说明实际状态和可执行选项
- **AND** Agent MUST NOT 自动 stash、rebase、merge、覆盖或继续执行 `buildr sync`

#### Scenario: Buildr Skill 感知非 Git workspace 同步意图
- **WHEN** 用户要求 Agent“更新 workspace”“同步 workspace”或表达明确等价意图，且 workspace root 不由 Git 管理
- **THEN** Buildr Skill MUST 直接运行 `buildr sync <agent> --target <dir>`
- **AND** Agent MUST NOT 先运行 `buildr update`
- **AND** Agent MUST 使用 sync 的最终 doctor 结果判断 workspace 同步是否完成

#### Scenario: CLI update 受阻时停止 Buildr 产品入口更新
- **WHEN** `buildr update` 返回 Git、registry、权限或来源决策点
- **THEN** Buildr Skill MUST 向用户说明阻塞事实和可执行选项
- **AND** Agent MUST NOT 使用旧 CLI 继续安装 Buildr Skill

#### Scenario: Buildr Skill 感知首次初始化意图
- **WHEN** 用户要求 Agent 首次使用 Buildr 管理尚未初始化的目录，且 runtime adapter 已确认
- **THEN** Buildr Skill MUST 引导 Agent 使用 `buildr init --agent <agent>` 完成源资产初始化、产品 Buildr Skill 安装、runtime render 和 doctor
- **AND** Buildr Skill MUST NOT 把独立 `skill install` 或 `sync` 列为完成首次 onboarding 的额外必需步骤

#### Scenario: Buildr Skill 与用户 Skills 保持区分
- **WHEN** Buildr 同步产品内置 Skills
- **THEN** Buildr MUST 将产品入口 Buildr Skill 与 `skills/buildr/*` 能力 Skills 区分开
- **AND** 用户 Skill MUST 只在 workspace `skills/manifest.yml` 和 workspace 源目录维护
- **AND** Project 专用语义 MUST 由 capability/applicability context 表达，而不是编辑 runtime 或 Project Skill source

#### Scenario: 内置能力 Skills 默认 optional
- **WHEN** Buildr 提供 `skills/buildr/*` 能力 Skills
- **THEN** 这些 Skills MUST 默认为 optional
- **AND** 用户 MUST 能够卸载 optional 内置 Skill，卸载时删除源目录和 runtime 投射，并在 `skills/manifest.yml` 保留卸载状态
- **AND** Buildr MUST report any required consumers that become blocked without silently restoring the builtin

### Requirement: Rule 与 Skill 语义边界
Buildr Skill MUST 按 asset semantics 定义 Rules 与 Skills，而不是按它们是否总会被加载定义，并且 MUST 说明 Rule manifest state 如何控制 Agent consumption。

#### Scenario: 解释 Rule 与 Skill
- **WHEN** 用户询问 Rules 与 Skills 的区别
- **THEN** Buildr Skill MUST explain that Rules control Agent values, boundaries, and constraints
- **AND** Buildr Skill MUST explain that Skills encapsulate reusable professional actions and procedures
- **AND** Buildr Skill MUST NOT define the primary distinction as whether the artifact is required or lazily loaded

#### Scenario: Agent 判断相关 Rules
- **WHEN** Agent works on a task that may touch user-managed Rules
- **THEN** Buildr Skill MUST require Agent to use Rule descriptions, user goals, files being changed, code semantics, and workspace context to judge relevant Rules
- **AND** Buildr Skill MUST NOT require users to preconfigure roles, paths, service names, or other routing tables for Rules relevance

#### Scenario: 解释 Rule manifest 状态
- **WHEN** 用户或 Agent 询问 enabled、required or state 如何影响 Rule 加载
- **THEN** Buildr Skill MUST explain that enabled、required and installed Rules are always read
- **AND** Buildr Skill MUST explain that enabled、non-required and installed Rules are semantically evaluated from description and read when relevant
- **AND** Buildr Skill MUST explain that disabled or uninstalled Rules do not participate in the current task
- **AND** Buildr Skill MUST distinguish runtime source discovery from Agent semantic relevance judgment

#### Scenario: Git 提交规则与技能边界
- **WHEN** Buildr Skill explains where Git commit guidance belongs
- **THEN** reusable Conventional Commits format、type selection and message generation procedure MUST belong to the Git operations Skill
- **AND** Buildr default commit language MUST belong to required Core so it remains independent of the Git operations Skill lifecycle
- **AND** more specific Project、Service or repository rules MUST be allowed to override the Core language default

### Requirement: Buildr 技能引导工具型资产维护
Buildr 内置技能 MUST 引导 Agent 使用 Buildr 源资产维护规则、技能和命令行工具清单，并区分源资产维护与运行环境投射。

#### Scenario: 维护规则
- **WHEN** 用户要求新增、修改或删除需要沉淀或复用的 root/Organization 规则
- **THEN** Buildr 技能 MUST 引导 Agent 使用 `rules add/remove` 维护 `rules/manifest.yml`
- **AND** Buildr 技能 MUST 引导 Agent 直接编辑 `AGENTS.md` 或 `rules/` 中的 Markdown 正文来维护规则内容
- **AND** Buildr 技能 MUST 说明 Rule description 是 Agent 判断规则语义相关性的索引，而不是人维护的路径或角色路由表
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

### Requirement: Buildr Skill 引导安装对象路由
Buildr 产品内置 Skill MUST 帮助 Agent 根据用户明确意图和安装对象的实际资源组成，选择单项资产维护或 workspace Component 生命周期。

#### Scenario: 用户明确要求 Component
- **WHEN** 用户明确要求将某个对象作为 Component 安装或管理
- **THEN** Buildr Skill MUST 引导 Agent 使用 Component 流程
- **AND** 即使该 Component 只有一个 Rule、Skill 或 Command collection，Agent MUST NOT 擅自降级为单项资产安装

#### Scenario: 用户明确要求单项资产
- **WHEN** 用户明确要求安装或登记一个 Rule、Skill 或 Command，且没有要求 Component 生命周期
- **THEN** Buildr Skill MUST 引导 Agent使用对应资产维护入口
- **AND** Buildr Skill MUST NOT 无理由包装为 Component

#### Scenario: 用户只要求安装某个对象
- **WHEN** 用户只表达“安装 X”而没有说明资产类型
- **THEN** Buildr Skill MUST 引导 Agent 阅读权威来源并识别会增加的 Rules、Skills、Commands 和其他资源
- **AND** 当结果跨越多个 Buildr 资产类型或需要统一版本、更新和卸载时，Agent MUST 创建或选择 Component
- **AND** 当只有单一资产且没有统一生命周期需求时，Agent MUST 使用对应单项资产入口

#### Scenario: 安装对象组成不明
- **WHEN** Agent 无法可靠确认安装对象包含哪些资源或这些资源是否属于同一生命周期
- **THEN** Agent MUST 向用户说明未知点或继续调查
- **AND** Agent MUST NOT 要求 Buildr CLI 根据名称、目录或网页内容猜测 Component 边界

### Requirement: Buildr Skill 引导 Component 安装闭环
Buildr Skill MUST 将 Component definition 视为 Agent 已完成语义分析后的确定性输入，并引导 CLI 完成源资产、runtime 和 doctor 闭环。

#### Scenario: 使用随包 Component
- **WHEN** Buildr package 已提供匹配用户目标的 Component
- **THEN** Agent MUST 优先检查并复用其版本、来源、成员和 integrity 定义
- **AND** Agent MUST 在执行前向用户说明将安装的资产类型和外部 Command 要求

#### Scenario: 创建 workspace-owned Component
- **WHEN** 上游未提供 Buildr Component，但用户意图或资源组成要求统一生命周期
- **THEN** Buildr Skill MUST 引导 Agent 在 workspace `components/` 中创建完整定义
- **AND** 定义 MUST 记录可验证的来源、版本、成员和 integrity
- **AND** Agent MUST 在定义通过 Buildr 检查后再执行安装

#### Scenario: 安装或卸载完成检查
- **WHEN** Agent 执行 Component install 或 uninstall
- **THEN** Buildr Skill MUST 要求提供当前受支持 Agent id
- **AND** Buildr Skill MUST 要求完成 runtime reconcile 和最终 `doctor --agent <agent> --json`
- **AND** 仍有 error 时 Agent MUST NOT 报告任务完成

#### Scenario: 外部 CLI 差异
- **WHEN** Component Command collection 声明的外部 CLI 缺失或版本不匹配
- **THEN** Buildr Skill MUST 使用 Commands 检查结果和 `installHint` 向用户说明差异
- **AND** Buildr Skill MUST NOT 声称 Component 安装会自动修改本机 CLI

### Requirement: Buildr Skill 引导对象级卸载确认
Buildr 产品内置 Skill MUST 在用户只表达卸载对象而未明确 Component 范围时，先识别该对象的 Component 所有权，并在 Component 卸载前获得针对完整范围的二次确认。

#### Scenario: 卸载对象是 Component
- **WHEN** 用户表达“卸载 OpenSpec”或等价对象级卸载意图
- **AND** Component registry 或 `component check` 表明该对象由 Component 管理
- **THEN** Agent MUST 将卸载动作解释为 Component lifecycle operation
- **AND** Agent MUST NOT 直接调用单项 `skills remove`、`commands remove` 或 `builtin uninstall`

#### Scenario: 展示 Component 卸载范围
- **WHEN** Agent 已确认卸载对象是 Component
- **THEN** Agent MUST 在执行前展示 Component id、source、version 和 workspace scope
- **AND** Agent MUST 列出将删除的 Rules、Skills、Command collections 和当前 Agent runtime 投射
- **AND** Agent MUST 明确说明本机外部 CLI 和 Project 中已有内容不会被删除

#### Scenario: 二次确认后执行
- **WHEN** Agent 已展示完整 Component 卸载范围
- **THEN** Agent MUST 再次请求用户明确确认
- **AND** 只有用户确认该范围后 Agent MUST 执行 `buildr component uninstall`
- **AND** 用户拒绝、未确认或改变范围时 Agent MUST NOT 修改源资产或 runtime

#### Scenario: 卸载对象不是 Component
- **WHEN** Component registry 和 ownership 检查表明卸载对象不属于 Component
- **THEN** Buildr Skill MUST 引导 Agent 使用对应单项资产卸载协议
- **AND** Agent MUST NOT 为了执行卸载临时创建 Component

### Requirement: 产品入口识别工作能力适配意图
产品入口 Buildr Skill MUST 识别可能改变 Skill 行为或跨 Skill 协作关系的用户工作意图，并 MUST 将具体资产开发路由到 `capability-adaptation` 管理 Skill；产品入口只对自身已命中的管理意图执行按需能力路由，MUST NOT 承载完整 workspace consumer dependency graph。

#### Scenario: 用户不使用 capability 术语
- **WHEN** 用户只表达“采用内部流程”“调整工作方式”“修改默认 Skill 行为”或等价自然语言意图
- **THEN** Buildr Skill MUST 识别这是工作资产维护意图
- **AND** Agent MUST NOT 要求用户先指出 Skill id、capability id、provider 或 binding

#### Scenario: 判断是否形成能力契约
- **WHEN** Agent 准备创建、修改、替换或卸载相关 Skill
- **THEN** Buildr Skill MUST 路由到 `capability-adaptation`
- **AND** 适配流程 MUST 判断目标行为是否被其他 Skill 组合、是否需要替换实现、consumer 是否依赖稳定保证或结果证据，以及生命周期是否需要影响诊断

#### Scenario: 产品入口是能力路由者
- **WHEN** 产品入口已因 Buildr 管理意图被加载，且该意图需要一项可替换 capability
- **THEN** Agent MUST 从当前 scope 的 Doctor full capability graph 解析该 capability 的 contract 和 selected provider
- **AND** 该 capability MUST 只作为本次意图的 required route
- **AND** 单项 capability blocked MUST NOT 阻塞 Buildr Skill 的无关管理意图
- **AND** 产品入口 runtime Skill MUST NOT 注入其他 consumers、其他 scopes 或完整 workspace capability graph
- **AND** 产品入口 MUST NOT 作为具有全部 capabilities required dependencies 的 workspace manifest consumer

### Requirement: Buildr Skill 使用 workspace source 与两种 render destination
产品入口 Buildr Skill MUST 将 Skill 源资产维护统一路由到 workspace，并 MUST 根据用户意图区分 user 与 workspace render destination。

#### Scenario: 用户创建项目专用 Skill
- **WHEN** 用户要求沉淀只适用于某个 Project 的 Skill
- **THEN** Buildr Skill MUST 在 workspace `skills/` 创建或登记该 Skill
- **AND** MUST 在 Project capability/applicability context 中记录项目语义
- **AND** MUST NOT 创建 Project `skills/` 源目录

#### Scenario: 用户要求当前工作目录使用 Skill
- **WHEN** 用户只要求当前 workspace 使用已登记 Skill
- **THEN** Buildr Skill MUST 使用 `buildr skills render <agent> --destination workspace`
- **AND** MUST NOT 修改用户级 Skills root

#### Scenario: 用户要求其他 workspace 也可使用 Skill
- **WHEN** 用户明确要求全局或个人级安装
- **THEN** Buildr Skill MUST 说明来源仍是当前 workspace
- **AND** MUST 在取得用户级写入授权后使用 `buildr skills render <agent> --destination user`

#### Scenario: init 和 sync 保持 workspace destination
- **WHEN** Agent 执行 init、sync 或未显式选择 destination 的 render
- **THEN** Buildr Skill MUST 只维护 workspace destination
- **AND** MUST NOT 隐式修改用户级 Skills

#### Scenario: Agent runtime 找不到所需 Skill
- **WHEN** 当前 Agent runtime 找不到用户所需 Skill
- **THEN** Buildr Skill MUST 检查 workspace Skill source、Project capability/applicability context 和当前 destination receipt
- **AND** 当 source 存在但 runtime 未同步或已过期时，MUST 引导 Agent执行对应 Skills render 或 runtime check
- **AND** MUST NOT 引导 Agent 直接把 Agent runtime 目录或 Project 目录当作 Skill source 维护

### Requirement: Buildr Skill 解释并处理 Agent Skills 同名行为
产品入口 Buildr Skill MUST 说明 Agent runtime 可以暴露多个同名 Skill，但 Buildr 受管投射不依赖未定义覆盖行为。

#### Scenario: 候选与当前 Agent Skill 同名
- **WHEN** render preflight 报告候选与用户、workspace、plugin、system 或其他来源 Skill 同名
- **THEN** Buildr Skill MUST 向用户展示可证明的来源、ownership、digest 和冲突类型
- **AND** MUST 提供 rename、skip、remove/disable external 或显式 adopt/transfer 中实际可执行的 nextActions
- **AND** MUST NOT 推荐依赖 Agent selector 顺序或隐式覆盖

#### Scenario: 不同 Skill 实现同一专业能力
- **WHEN** 用户希望保留两个不同实现并选择其中一个参与 Skill 协作
- **THEN** Buildr Skill MUST 引导它们使用不同 Skill ID 和同一 capability contract
- **AND** MUST 通过显式 binding 选择 provider

### Requirement: Buildr Skill 必须引导 Agent 使用 Project Domain
Buildr Product Skill MUST explain the canonical Project fields, source boundary, migration path and declared/observed Git distinction when Project intent is in scope.

#### Scenario: Agent 创建 Project
- **WHEN** 用户要求创建 workspace or Git Project
- **THEN** Skill MUST guide Agent to collect code, name, description and source declarations required by that source type
- **AND** Agent MUST validate target Workspace, materialized path and Git identity before invoking canonical CLI

#### Scenario: Agent 处理 Project migration
- **WHEN** doctor or app reports v1 Project registry migration required
- **THEN** Skill MUST direct Agent to inspect the plan and use canonical update or sync
- **AND** MUST NOT recommend hand-editing generated UUIDs or silently rewriting from the UI

#### Scenario: Agent 处理分支漂移
- **WHEN** observed current branch differs from declared integration branch
- **THEN** Skill MUST treat it as task context to investigate rather than proof of corruption
- **AND** MUST require clean/ownership/task checks before any switch and MUST NOT blindly checkout or stash

### Requirement: Buildr Skill 必须引导 Agent 使用 Service Domain
产品入口 Buildr Skill MUST 解释 Service 字段、父实体关联、source、显式迁移和 Git 声明/观察边界。

#### Scenario: Agent 创建 Service
- **WHEN** 用户要求接入本地目录或 Git Service
- **THEN** Skill MUST 引导 Agent 核对 Project、Domain 字段、物化路径和 Git identity 后调用 canonical service create

#### Scenario: Agent 看到 branch drift
- **WHEN** doctor 或 UI 报告 current branch 偏离 integration branch
- **THEN** Skill MUST 引导 Agent 结合当前任务判断，而不是让 Buildr 自动切换分支

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

### Requirement: Package必须投射Declaration Intake Skill
Buildr package MUST提供`declaration-intake` workspace Skill，description MUST覆盖声明初始化、刷新及自动触发缺口。Skill MUST声明只读发现、用户授权与owner handoff，并 MUST不成为Preparation或Verification capability provider。

#### Scenario: 授权Preparation写入
- **WHEN** Intake取得`preparation.yml`精确diff授权
- **THEN** Agent MUST直接维护Project拥有的准备入口并核对真实wrapper、cwd和scope
- **AND** Intake Skill MUST不执行准备入口或保存Task级结果

#### Scenario: 授权Verification写入
- **WHEN** Intake取得`verification.yml`精确diff授权
- **THEN** Agent MUST进入`task-verification` owner流程维护声明
- **AND** Intake Skill MUST不执行或开发验证能力

### Requirement: Task Skills 必须解释协调与专业 authority 边界
`task-review` Skill MUST指导Agent从用户目标、Task、真实subject和专业owner事实动态选择Planning或Completion审查，先inspect current slot，再使用现有代码/Git/文件/测试/Browser/HTTP/外部工具完成审查，最后以CAS record完整Result。Skill MUST不要求Environment、Development、Candidate、Handoff或统一gate；目标不明或审查中断时不得写Result。

#### Scenario: Agent审查普通代码修改
- **WHEN** 用户要求审查一个没有Development的服务修复Task
- **THEN** Agent MUST读取Task与真实diff、相关测试和Service规则形成subject identity及Review Result
- **AND** MUST不要求补造OpenSpec、Candidate或Development Receipt

#### Scenario: runtime Agent读取新流程
- **WHEN** runtime Agent命中Task Review意图
- **THEN** MUST读取投射后的Task Review Skill并直接检查Task、current slot和真实subject
- **AND** MUST不读取`task next`或要求Development provider

#### Scenario: 专业provider不可用
- **WHEN** Task Review provider未绑定或不可用
- **THEN** Agent MUST报告Review动作不可执行且不写Result
- **AND** MUST不阻塞其他不依赖Review的Task工作

### Requirement: Runtime投射必须来自Workspace source
更新后的Skills/contracts MUST从Product package source同步到Workspace source再投射当前Agent runtime；派生`.agents/skills` MUST NOT作为长期编辑authority。

#### Scenario: 自举同步
- **WHEN** Formal Finish交付包含Skill或contract source变化
- **THEN** self-bootstrap MUST按冻结Contribution执行适用sync/render
- **AND** 最终Doctor MUST证明selected Agent graph与projection ready

### Requirement: 产品入口 Buildr Skill 分离宿主身份与投射目标
产品入口 Buildr Skill MUST 将当前宿主 Agent、用户明确指定的维护目标和 Buildr 投射 adapter 视为不同事实。普通面向当前环境的操作 MUST 使用宿主明确提供且受支持的 adapter；只有用户明确指定其他 runtime 时才能改用该目标。

#### Scenario: Qoder 读取 Codex 投射后更新 workspace
- **WHEN** Qoder 会话发现了由 Codex adapter 投射到 `.agents/skills/` 的 Buildr Skill，且用户只要求“更新 workspace”
- **THEN** Buildr Skill MUST 使用 `qoder` 执行 workspace sync 和后续 Doctor
- **AND** MUST NOT 因投射路径、生成正文或已有 Codex runtime 而使用 `codex`

#### Scenario: 用户明确维护其他 runtime
- **WHEN** 当前宿主是 Qoder，且用户明确要求更新 Codex runtime
- **THEN** Buildr Skill MUST 允许把本次明确目标设为 `codex`
- **AND** MUST NOT 把该目标改写为当前宿主身份

#### Scenario: 当前宿主身份无法确认
- **WHEN** Agent 宿主没有提供可与 supported adapter 对齐的明确身份，且用户也未明确指定目标
- **THEN** Buildr Skill MUST 在执行需要 `<agent>` 的命令前停止并请求确认
- **AND** MUST NOT 使用投射文件、受支持列表或其他 adapter 作为 fallback

### Requirement: 产品入口 Buildr Skill 禁止从投射诊断推断宿主身份
产品入口 Buildr Skill MUST 明确禁止从 Skill 路径、generated marker、投射回执以及 Doctor 的 `requested`、`selected` 或 `detectedAgents` 推断当前宿主 Agent。

#### Scenario: Doctor 检查显式 adapter
- **WHEN** Agent 运行 `buildr doctor --agent codex`
- **THEN** Buildr Skill MUST 将结果解释为检查了调用者显式选择的 Codex runtime
- **AND** MUST NOT 将 `selected: codex` 或包含 `codex` 的 `detectedAgents` 解释为宿主身份验证

### Requirement: Agent Skills 必须区分 todo 创建与 active 启动
Task Triage 与 Task Manager provider MUST 将 todo 创建视为仅写 Workspace SQLite 的已接受意向，将 active 创建或 todo 激活视为正式执行入口。只有后者 MUST 条件消费 Git Operations 完成创建前基线收敛；Task Manager Application 自身 MUST 保持不执行 Git。

#### Scenario: 复盘产生 todo
- **WHEN** 用户同意保留复盘改进意向但未要求立即研发
- **THEN** Agent MUST 通过 Task Manager 创建 todo 与来源关系
- **AND** MUST NOT运行 Git baseline、准备 Environment 或创建 Change

#### Scenario: 启动 todo
- **WHEN** 用户要求开始执行已有 todo
- **THEN** Task Triage MUST 先完成当前事实确认与 Git 基线收敛，再调用 activate
- **AND** 任一前置门禁 blocked 时 MUST 保持 todo 不变

### Requirement: Task Finish Skill 必须为 bootstrap recovery取得单独明确授权

Task Finish Skill MUST只在retained Finish Result或Execution Record证明existing run停止于受支持的`product-phase-provider` preflight/prepare边界、无交付副作用，且repair checkout current、clean、committed时提出bootstrap recovery。调用前MUST展示run、冻结Candidate/generation与Content Target、source commit、retained-writer边界、将创建或复用的capsule、候选provider并非sandbox以及恢复限制，并MUST取得用户对该run的单独明确授权。

#### Scenario: 观察到合格retained provider defect

- **WHEN** retained Result闭合支持的failure predicate且repair checkout满足authority条件
- **THEN** Skill MUST说明retained Application/repository/state machine仍是canonical owner
- **AND** MUST说明ES module会执行受验证provider模块及其本地依赖闭包，而不是只执行一个导出函数
- **AND** MUST等待用户明确授权后才增加`--bootstrap-recovery`

#### Scenario: 同一run后续blocked恢复

- **WHEN** 已授权bootstrap run在provider authority仍有效时进入普通blocked phase
- **THEN** Skill MUST复用同一run、capsule与current Product resume token
- **AND** MUST NOT创建新Candidate、Verification、Review、handoff或递归修复Task

#### Scenario: provider authority撤销后的terminal恢复

- **WHEN** capsule revocation已证明authority撤销且只剩terminal persistence未完成
- **THEN** Skill MUST使用产品返回的same-run retained-only resume动作
- **AND** MUST NOT尝试恢复、重建或重新加载capsule

#### Scenario: 恢复不合格

- **WHEN** failure evidence不完整、origin/phase不支持、已有副作用、authority漂移或故障位于CLI/registry/Application/repository/migration层
- **THEN** Skill MUST保留普通Finish blocker并停止
- **AND** MUST NOT推断临时runtime、tarball、source path、alternate writer或人工Git旁路

### Requirement: 产品入口 Buildr Skill 必须主动解释 GA 与 RC 更新
产品入口 Buildr Skill MUST 在用户要求完整检查、安装状态检查或更新 Buildr 时运行 `buildr update check --json`，读取 stable/candidate 轨道，并用普通用户可理解的语言告知可用更新和请求用户选择。

#### Scenario: Agent 发现两个轨道更新
- **WHEN** `buildr update check --json` 返回 GA 或 RC 可更新
- **THEN** Agent MUST分别说明 GA 正式版与 RC 候选版
- **AND** MUST询问用户选择 stable、candidate 或暂不更新

#### Scenario: 用户选择轨道
- **WHEN** 用户明确选择 GA 或 RC
- **THEN** Agent MUST执行对应 `buildr update --track stable|candidate`
- **AND** MUST NOT替用户切换另一个轨道

#### Scenario: 版本检查不可用
- **WHEN** 结构化 Release Awareness 返回 unavailable 或 blocked
- **THEN** Agent MUST说明版本检查暂不可用
- **AND** MUST NOT把该结果解释为 Workspace Doctor 失败

### Requirement: 产品内置 Skill 必须能发现并执行项目每日演进
Buildr package MUST 提供可投射的产品 Skill，使 Agent 能发现「展示或生成项目每日演进」意图，并 MUST 引导 Agent：先同步最新代码，再收集目标日期的全部 Git 提交与更改文件，用本机 `git config user.email` 对比作者，总结四问日摘要并判断自己的提交是否关联已有 Task，最后通过 Daily Progress Application/CLI 写入 `.buildr/daily-progress/<project-code>/` 当天文件。该 Skill MUST NOT 让 Buildr 产品在读取路径扫描 Git 或自动撰写摘要，MUST NOT 把每日演进写入 Task Record，MUST NOT 为他人提交挂 Task，也 MUST NOT 要求产品 cron。

#### Scenario: 用户要求生成今天的项目每日演进
- **WHEN** 用户要求展示、生成或重跑某 Project 的每日演进
- **THEN** Skill MUST 先执行写入前代码同步门禁
- **AND** 成功后 MUST 收集当日 Git 提交与更改文件，再调用 Daily Progress record，而不是手写 YAML、写入 SQLite 或让页面现场合成

#### Scenario: 用户问能否每天自动跑
- **WHEN** 用户询问每日演进是否自动执行
- **THEN** Skill MUST 说明这取决于 Agent 宿主定时器
- **AND** MUST NOT 引导实现 Buildr 产品 cron

### Requirement: Package 必须投射独立 UI Prototype Skill
Buildr package MUST 提供 id 为 `ui-prototype` 的 optional workspace Skill，并 MUST 将其作为普通 `skills/buildr/*` 资产同步和投射到支持的 Agent runtime。该 Skill MUST NOT 建立 capability contract 或 provider binding；用户在适用 scope 提供同名 Skill 时，MUST 沿用现有 Skill 重载与选择语义替换默认实现。

#### Scenario: Workspace 同步 UI Prototype Skill
- **WHEN** Buildr 将 package 资产同步到支持的 workspace runtime
- **THEN** `ui-prototype` MUST 作为 optional builtin Skill 可被发现
- **AND** 用户卸载或同名重载 optional Skill 时 MUST 遵守现有 builtin 投射与 Skill selection 语义

#### Scenario: 审查能力边界
- **WHEN** 维护者检查 `ui-prototype` 的 package manifest 与 Skill 正文
- **THEN** Skill MUST 不声明 `provides` 或 `requires` capability
- **AND** MUST 明确区别于正式设计、canonical specs 和真实前端工程中的编码式原型

### Requirement: 产品必须提供按需的智能体优先设计技能
Buildr MUST 提供可选 `agent-first-design` 技能（Skill），在用户设计或改造智能体参与产品交付的软件，或审视智能体工作系统的职责、工作流及门禁时提供已确认范式、关系图和判断方法。技能 MUST 不成为普通开发或收尾的统一前置，也不引入新规则、评分或审批门禁。发现描述与正文 MUST 区分使用智能体开发软件和引入智能体交付产品结果；渐进演进时只指导相关部分，并保留既有业务、安全及授权边界。

#### Scenario: 审视职责与流程
- **WHEN** 用户要求判断智能体、技能、工具、接口与应用应该各自负责什么
- **THEN** 技能 MUST 先围绕目标和真实现场选择现有能力，再判断必要的新软件能力，不预建接口清单。

#### Scenario: 普通任务
- **WHEN** 用户只是执行既有任务或普通收尾
- **THEN** 既有技能 MUST 不强制加载设计技能，也不要求额外评审或结果对象。

#### Scenario: 普通软件渐进引入智能体
- **WHEN** 原有产品开始引入智能体帮助用户完成业务目标
- **THEN** 技能 MUST 指导相关部分的职责和能力设计，不要求整个产品同时改造
- **AND** 普通业务逻辑 MUST 保持适用的确定性规则与安全约束

### Requirement: 设计方法必须连接真实实践及当前实现说明
设计技能 MUST保存完整已确认范式，说明技能可沉淀可调整的工作流（Workflow）；案例 MUST区分真实观察、候选建议与限制。收尾的真实参与者与职责 MUST继续由统一实现说明维护，不复制另一份模块权威。

#### Scenario: 引用收尾案例
- **WHEN** 使用收尾案例解释设计取舍
- **THEN** 技能 MUST提供实际版本、动作、统计口径和限制，不把不同窗口的时间或未测量词元（Token）声称为优化收益。

#### Scenario: 分发与发现
- **WHEN** 技能通过既有资源清单安装或同步
- **THEN** 正文和案例参考 MUST完整投射且可按需读取，无额外接口、应用或数据库。

### Requirement: 设计技能围绕产物指导多入口接续
技能 MUST 以当前根规则为原则来源，提供产物身份、权威来源、当前版本、变化发现、冲突处理、人类查看与目标验收的设计判断。接口 MUST 指被设计系统的能力，Buildr 和 Git 只作为具体工具或案例；技能 MUST 不强制统一产物数据库、自动登记或持续监听。

#### Scenario: 人修改后智能体继续
- **WHEN** 人通过界面修改智能体正在处理的中间成果
- **THEN** 技能 MUST 指导设计变化发现与重新读取当前版本的能力，防止智能体依据旧对话覆盖修改

#### Scenario: 智能体修改后人查看
- **WHEN** 智能体从工具入口修改成果
- **THEN** 技能 MUST 指导人通过界面查看同一成果及必要变化，不要求人阅读完整执行过程

#### Scenario: 当前一致但目标未完成
- **WHEN** 多入口已对齐同一成果，但质量、验证或约定交付仍未满足
- **THEN** 技能 MUST 依据目标继续处理，不能仅凭版本一致宣称完成

### Requirement: 智能体优先设计必须明确对象与改造完整性
agent-first-design MUST区分研发协作和被开发产品设计；只有智能体参与的工作系统或明确选择该设计方向的产品才使用本方法。传统业务软件 MUST不因位于 Buildr 工作空间而强制改变职责。

#### Scenario: 传统业务软件
- **WHEN** 集鲜订单或结算系统未选择智能体优先产品设计
- **THEN** 保留其确定性业务职责，不强制加载设计方法

#### Scenario: 职责改造
- **WHEN** 修改一个模块的方法与职责
- **THEN** 检查入口、消费者、契约、测试及当前说明，退役无用旧依赖

### Requirement: Task Verification Skill必须指导Agent直接验证并形成报告
Package MUST投射Task Verification Skill，指导Agent探查项目测试体系、读取v4测试地图、结合Task与当前改动选择具体测试，并直接使用Maven、npm、Playwright、Browser、HTTP或项目runner。Skill MUST区分开发反馈与开发完成验证；只有后者调用Task Verification record。

#### Scenario: 开发过程中运行测试
- **WHEN** Agent为当前修改运行focused单元或功能测试
- **THEN** Skill MUST指导Agent修复失败并继续开发
- **AND** MUST NOT记录Task Verification Report

#### Scenario: 开发完成
- **WHEN** Agent认为实现完成并准备验证
- **THEN** Skill MUST指导Agent执行任务相关测试、相关服务低成本完整回归和适用环境冒烟
- **AND** 形成包含选择理由、实际targets、结果、gaps和结论的报告后调用record

### Requirement: Package 不得投射 Task Development 或旧 Finish Skill 依赖
Buildr package MUST不再提供`task-development` Skill、`buildr.task-development` contract/provider/binding，也 MUST不在OpenSpec、Current Knowledge、Release或Task Skills中要求Task Planning Identity、Development Receipt、Task Candidate或旧Finish Application。

#### Scenario: 初始化或同步Workspace
- **WHEN** current package向Agent runtime投射Skills与capability bindings
- **THEN** 输出 MUST不存在Task Development Skill、contract、provider或consumer dependency
- **AND** OpenSpec、Review、Verification、Environment与默认task-finish MUST保持可发现

### Requirement: UI相关工作必须由实际入口询问原型并默认遵循已有原型
Task Triage与Buildr OpenSpec propose、update、apply contributions MUST在当前任务可能改变前端UI时询问用户是否需要UI Prototype，并只在明确确认后路由selected provider。已有原型时Agent MUST默认按其信息架构、布局和交互开发，除非用户明确要求忽略。

#### Scenario: 用户不需要原型
- **WHEN** 用户明确拒绝本次UI Prototype
- **THEN** Agent MUST继续当前Task或OpenSpec工作
- **AND** MUST不创建原型状态或流程门禁

### Requirement: 产品必须投射纯任务复盘Skill
Buildr package MUST继续投射可选`task-retrospective` Skill，指导Agent按用户明确要求生成固定本机Markdown、登记Task Record文档事实和处理缺失数据。该Skill MUST不提供独立capability，不调用内部Driver，不维护处置队列或专用来源关系。

#### Scenario: 用户明确要求复盘
- **WHEN** Agent runtime发现终态Task复盘意图
- **THEN** Agent MUST读取纯Skill并组合当前Task与真实工具
- **AND** provider缺失 MUST不成为问题，因为不存在可替换Retrospective Application能力

#### Scenario: 用户接受后续行动
- **WHEN** 用户明确决定复用或创建普通Task
- **THEN** Skill MUST把精确Task effects交给Task Manager
- **AND** MUST不创建专用relation、action item或自动修改其他资产
