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
产品入口 Buildr Skill MUST 识别可能改变 Skill 行为或跨 Skill 协作关系的用户工作意图，并 MUST 将具体资产开发路由到 `capability-adaptation` 管理 Skill。

#### Scenario: 用户不使用 capability 术语
- **WHEN** 用户只表达“采用内部流程”“调整工作方式”“修改默认 Skill 行为”或等价自然语言意图
- **THEN** Buildr Skill MUST 识别这是工作资产维护意图
- **AND** Agent MUST NOT 要求用户先指出 Skill id、capability id、provider 或 binding

#### Scenario: 判断是否形成能力契约
- **WHEN** Agent 准备创建、修改、替换或卸载相关 Skill
- **THEN** Buildr Skill MUST 路由到 `capability-adaptation`
- **AND** 适配流程 MUST 判断目标行为是否被其他 Skill 组合、是否需要替换实现、consumer 是否依赖稳定保证或结果证据，以及生命周期是否需要影响诊断

#### Scenario: 产品入口是能力路由者
- **WHEN** 产品入口根据某个用户意图使用 capability routing evidence
- **THEN** 该 capability MUST 只作为本次意图的 required dependency
- **AND** 单项 capability blocked MUST NOT 阻塞 Buildr Skill 的无关管理意图
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
Buildr `git-operations` Skill MUST 为已授权 commit operation 提供精简的 Conventional Commits 提交信息规则，并 MUST 遵循 Core 和更具体的提交语言约定。

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
- **THEN** Git Operations MUST 遵循 Core 的默认提交语言和当前 scope 的更具体约定
- **AND** Git Operations MUST NOT 在 Skill 正文中复制 Core 的语言约束

#### Scenario: 仓库已有明确格式
- **WHEN** 项目或仓库规则定义了比 Git Operations 默认格式更具体的提交约定
- **THEN** Agent MUST 遵循更具体的项目或仓库约定

### Requirement: 产品入口 Buildr Skill 路由 Task Retrospective
产品内置 Buildr Skill MUST 在用户明确要求任务复盘时路由到 selected `buildr.task-retrospective/v1` provider，并 MUST 将该入口限制为 terminal Task 的 Agent 执行效率复盘。

#### Scenario: 用户明确要求任务复盘
- **WHEN** 用户要求复盘已完成或已放弃 Task 的执行效率
- **THEN** Buildr Skill MUST 引导 Agent 使用 selected Task Retrospective provider
- **AND** MUST NOT恢复过程 observation、资产候选或 lifecycle gate

#### Scenario: Runtime 找不到 provider
- **WHEN** capability graph 表示 provider 应存在但 runtime 无法发现
- **THEN** Buildr Skill MUST 引导 Agent 检查 builtin、workspace source、binding 和 runtime 投射

### Requirement: 产品入口按 current capability 路由复盘意图
产品入口 Buildr Skill MUST 将明确的 terminal Task 执行效率复盘路由到 `buildr.task-retrospective/v1` selected provider，并 MUST NOT 将 builtin Skill id 当作不可替换入口。

#### Scenario: 路由 Task Retrospective
- **WHEN** 用户明确要求复盘 terminal Task 的 Agent 执行效率
- **THEN** Buildr Skill MUST 使用当前 capability graph 的 v1 selected provider
- **AND** Buildr Skill MUST honor blocked semantics

#### Scenario: 用户替换 provider
- **WHEN** workspace 绑定兼容的内部 v1 provider
- **THEN** Buildr Skill MUST 路由到该 provider而不要求 `task-retrospective` Skill id
