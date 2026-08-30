# Agent-first 产品定位规范

## Purpose

定义 Buildr 对外的 Agent-first 用户模型、组织工作资产、共享工作环境、任务上下文责任边界与多层用户价值表达。
## Requirements

### Requirement: Buildr 采用 Agent-first 用户模型
Buildr MUST 将 Agent 视为组织工作资产的主要使用者，并 MUST 将人描述为通过 Agent 表达目标、提供业务判断和确认重要决策的一等参与者。Buildr MUST 将组织持续维护的工作资产作为成员进入组织后通过 Agent 开展工作的共同基础，并 MUST 在公开入口用直接语言表达“任何人进入组织都可以从一句自然语言指令开始，由 Agent 准备工作环境并进入任务”。

#### Scenario: 公开入口介绍 Buildr 用户
- **WHEN** README、产品主说明或 Buildr Skill 介绍 Buildr 的用户与协作关系
- **THEN** 文档 MUST 优先说明 Agent 如何消费组织工作资产并引导工作
- **AND** 文档 MUST 说明人无需先掌握完整内部模型或命令体系即可通过 Agent 使用 Buildr

#### Scenario: 组织成员从自然语言指令进入任务
- **WHEN** README 或产品主说明介绍组织成员如何基于已有工作资产开始工作
- **THEN** 文档 MUST 直接表达任何人进入组织都可以从一句自然语言指令开始，由 Agent 准备工作环境并进入任务
- **AND** 具体初始化、同步、权限与环境前置条件 MUST 留在相应使用说明和行为契约中，不得堆叠进该产品承诺

### Requirement: Buildr 区分工作资产、共享工作环境和任务上下文
Buildr MUST 将所有潜在工作信息来源描述为 Work Information Space（工作信息空间），将 Workspace 描述为工作范围和发现入口，并 MUST 明确文件或信息位于 Workspace 不等于被 Buildr 治理。Buildr MUST 将其中被明确组织、登记或纳入治理、可长期复用的工作事实和工作方法描述为 Work Assets（工作资产），将这些资产与入口经组织和 runtime 投射形成的整体使用体验描述为 Agent 的 Shared Work Environment（共享工作环境）。Context MUST 表示特定工作范围中可供 Agent 发现、选择和使用的候选信息；Work Context、Workspace Context、Project Context 和 Service Context MAY 作为范围限定。Task Context MUST 限定为 Agent 为当前 Task 从工作信息空间中发现、检索、判断、选择、组织和压缩后实际使用的语义工作集；Context Window MUST 限定为某一次模型调用实际装入的有限、临时输入，是 Task Context 在某一时刻的有限投影，不得与 Context、Task Context、Task 或持久工作资产混同。工作事实描述“干的是什么”，工作方法描述“怎么干”；专业能力 MUST 作为工作方法可承载的内容，不得与工作事实、工作方法并列为第三个公开顶层分类。Rules、Skills、Commands、Specs、产品事实、Projects、Services 和协作流程等 MUST 只作为当前示例，不得被描述为封闭的长期资产枚举。

#### Scenario: 产品文档解释上下文责任
- **WHEN** 公开文档解释 Buildr 如何帮助 Agent 获得任务信息
- **THEN** 文档 MUST 说明 Buildr 治理 Work Information Space 中适合长期复用的 Work Assets，并将资产和入口组织、投射为 Shared Work Environment
- **AND** 文档 MUST 说明 Agent 可同时使用 Buildr Work Assets 与数据库、API、网页、用户输入、机器状态或工具结果等外部信息形成 Task Context，并只把当前推理所需部分放入有限 Context Window
- **AND** 文档 MUST NOT 宣称 Buildr 治理全部工作信息、直接提供完整 Context Window、把 Project Context 等同于已加载输入或保证所有任务信息完整无缺
- **AND** 文档提及尚未实现的 MCP、hooks 或其他未来资产形态时 MUST 明确其不是当前能力事实

#### Scenario: 公开入口解释工作资产
- **WHEN** README、产品主说明、Buildr Skill 或 Buildr Core 概括工作资产的内容
- **THEN** 文档 MUST 使用“工作事实”和“工作方法”作为公开顶层解释
- **AND** 文档 MAY 使用 Rules、Skills、Commands、Specs、Projects、Services 或专业能力作为两类内容的示例
- **AND** 文档 MUST NOT 将该二分法描述为受管资产类型的封闭枚举

#### Scenario: 区分 Project Context 与 Context Window
- **WHEN** 文档、Skill 或用户界面同时讨论项目可用信息与模型输入限制
- **THEN** Project Context MUST 表示 Project 范围内可发现和选择的候选信息
- **AND** Context Window MUST 只表示某次模型推理的有限临时输入
- **AND** 两者 MUST NOT 使用同一术语或被表述为相同持久范围

#### Scenario: Workspace 中存在未受治理内容
- **WHEN** Workspace 同时包含受管 Rules、Skills、OpenSpec、registries 与普通代码、临时文件、依赖或本机配置
- **THEN** Workspace MUST 继续作为这些内容的工作范围和发现入口
- **AND** 只有被明确组织、登记或纳入治理的长期工作事实与工作方法才能被表述为 Buildr Work Assets
- **AND** “位于 Workspace” MUST NOT 被当作“由 Buildr 治理”的充分条件

#### Scenario: Agent 使用 Workspace 外部信息完成任务
- **WHEN** Agent 通过数据库连接、API、网页、语义检索或其他授权来源获得任务相关信息
- **THEN** 这些信息 MAY 进入 Task Context
- **AND** 它们 MUST NOT 因被 Task 使用而自动成为 Buildr Work Assets
- **AND** Buildr MUST NOT 将 `rg`、`grep`、SQL、语义检索或任一具体检索工具规定为 Context 模型的一部分

#### Scenario: 区分 Task Context 与 Task
- **WHEN** Agent 为当前 Task 发现并组织相关资料
- **THEN** Task MUST 表示持续推进的工作目标和状态
- **AND** Task Context MUST 表示该 Task 当前实际使用的相关信息
- **AND** Task 继续存在或跨会话推进 MUST NOT 被解释为同一个 Context Window 永久保留

### Requirement: Buildr 不复制 Agent 的通用工作能力
Buildr MUST NOT 将自身定位或设计为另一个 Agent，也 MUST NOT 接管 Agent 的通用理解、推理、规划、对话和专业任务执行职责。Buildr 产品核心 MUST 聚焦组织工作资产治理、Agent 可发现入口、runtime 投射、确定性状态变更、完整性保护和诊断；可复用专业动作 MUST 由 Buildr 作为工作方法治理并交给 Agent 使用，而不是实现为 Buildr 自身的推理或执行主体。

#### Scenario: 评审新增产品能力
- **WHEN** 维护者评审一项拟进入 Buildr 的产品能力
- **THEN** 设计 MUST 说明该能力提供的长期治理、跨 Agent 复用、确定性约束或可验证诊断价值
- **AND** 如果该能力只是在 Buildr 内复制 Agent 已有的通用理解、推理、规划、对话或专业任务执行能力，设计 MUST 将其保留给 Agent，不得加入 Buildr 产品核心
- **AND** 如果该能力代表需要复用和治理的专业动作，设计 MUST 优先将其表达为 Agent 使用的 Skill 或其他工作方法资产

#### Scenario: 产品说明解释 Buildr 与 Agent 的关系
- **WHEN** README、产品主说明或开发规则解释 Buildr 与 Agent 的职责边界
- **THEN** 文档 MUST 说明 Buildr 不成为另一个 Agent，而是为 Agent 组织和准备开展工作所需的资产、入口与确定性边界
- **AND** 文档 MUST 保留 Agent 发现相关内容、形成任务上下文、推理并推进任务的责任

### Requirement: README 直接表达同一 Agent 任务的端到端工作连续性
Buildr 公开 README MUST 先用直接、简洁的语言说明 Agent 可以在同一个用户任务窗口中，从想法、方案和文档持续推进到执行、验证、集成和交付，并 MUST 将 Buildr 的作用描述为组织 Agent 在各阶段可发现和使用的工作资产。README MUST 将“同一个 Agent 窗口”限定为用户任务连续性，不得将其等同于单个模型 context window、一次加载全部资产或无条件自动完成所有工作。

#### Scenario: 首次访问者理解端到端价值
- **WHEN** 个人、团队成员或组织负责人首次阅读 README 首屏和端到端场景
- **THEN** README MUST 让读者无需先理解 Rules、Skills、Project、Service 或 runtime adapter 即可知道 Buildr 帮助 Agent 连续推进整件工作
- **AND** README MUST 说明 Agent 随任务阶段发现并使用相关事实、规则、能力、项目关系和流程
- **AND** README MUST 说明人继续提供目标、业务判断以及权限或外部审批

#### Scenario: Buildr 使用自举事实证明端到端工作
- **WHEN** README 使用 Buildr 自身作为端到端案例
- **THEN** 案例 MUST 将讨论梳理、OpenSpec 提案/设计/任务、实现测试、Git 集成、GitHub Actions 和 npm 发布限定为 Buildr 当前已经建立的工作链
- **AND** 案例 MUST NOT 宣称 Buildr 已提供通用 workflow engine、多 Agent 自动编排或全部外部工具的内置集成

### Requirement: README 按真实 workspace 与 runtime 边界解释 Buildr
Buildr 公开 README MUST 区分 Agent 在 Buildr workspace 或 Project 中直接发现和使用的长期源资产，以及由 runtime adapter 投射到 Agent 原生入口的资产。README MUST 将 Project 事实、OpenSpec、普通文档、Commands、registries 和 Service 内容保持为 workspace/Project 源资产，并 MUST 将 Skills 描述为 workspace source，经 user/workspace destination 投射；Project 只提供 capability/applicability context。

#### Scenario: README 展示 Buildr 如何工作
- **WHEN** README 使用图示或文字解释 Buildr workspace、Project、Agent 与 runtime adapter 的关系
- **THEN** README MUST 展示 Agent 可以直接从 workspace 或 Project 发现项目事实和 Service 内容
- **AND** README MUST 展示 runtime adapter 只投射当前 Agent 原生需要的 Rules、workspace Skills、产品 Buildr Skill、Skill install plans 及 adapter 契约明确声明的入口
- **AND** README MUST NOT 暗示 Project Skill source、普通项目说明、全部工作资产或 Service repo 会复制或渲染进 Agent runtime

### Requirement: 公开入口表达多层用户价值
Buildr 公开 README MUST 让个人用户、团队成员和企业负责人分别理解 Buildr 对同一 Agent 窗口端到端工作、个人能力转化为长期资产、团队基于共同 Project 事实协作、工作资产复用、Agent 工具切换、多服务工作和跨岗位信息发现的价值，并 MUST 将尚未实现的企业能力与当前事实区分。README MUST 通过用户可代入的具体工作场景表达这些价值，不得仅使用抽象角色价值表或产品能力分类替代场景。

#### Scenario: 不同读者首次访问 README
- **WHEN** 个人用户、团队成员或企业负责人首次阅读 README
- **THEN** README MUST 在快速开始前提供与其工作问题相关的具体场景
- **AND** 个人价值 MUST 说明 Agent 可以在同一任务中持续推进端到端工作并复用个人工作资产
- **AND** 团队价值 MUST 说明产品岗位维护 Project 中的产品事实，设计、开发、测试等岗位的 Agent 基于同一事实工作，事实更新后后续岗位自然使用最新来源
- **AND** 企业价值 MUST 说明 Buildr 将散落在员工个人经验、工作能力和各处组织知识中的内容沉淀为可共享、可传承、可复用的组织资产
- **AND** 企业价值 MUST 表述为组织资产与协作治理基础，不得暗示当前已实现完整企业权限、云平台或数据防泄漏能力

#### Scenario: 团队基于同一项目事实协作
- **WHEN** README 以产品变更说明跨岗位协作
- **THEN** README MUST 说明产品岗位维护产品文档、PRD、Specs 和相关产品事实
- **AND** README MUST 说明设计、开发、测试等岗位的 Agent 根据当前任务发现并使用同一 Project 事实及各自领域资产
- **AND** README MUST 说明其他岗位发现产品问题后反馈产品修改事实源，后续岗位工作自然使用更新后的内容
- **AND** README MUST NOT 将该协作价值归因于固定 Team Leader 路由、固定岗位 Agent 或自动同步所有副本

### Requirement: 跨工作范围问题使用准确表述
Buildr 产品说明 MUST 将信息割裂问题描述为 Agent 往往只能感知当前工作范围内的信息、难以主动发现其他岗位或服务中与任务相关的依赖，并 MUST 将 Buildr 的作用限定为组织工作资产和提供发现基础。

#### Scenario: README 描述跨岗位协作
- **WHEN** README 解释传统文档、会议、IM 和口口相传造成的协作问题
- **THEN** README MUST 说明工作资产按岗位、仓库或工具割裂会限制 Agent 的任务视野
- **AND** README MUST NOT 绝对声称 Agent 获得 Buildr 后会自动理解所有跨岗位依赖

### Requirement: Buildr 功能优先由 Agent 执行
Buildr MUST 将 Agent 作为产品功能的默认操作入口；人通过 Agent 表达目标、授权必要变更和提供 Agent 无法代替的判断，而不需要默认代 Agent 执行 Buildr 命令。

#### Scenario: Agent 能安全完成用户目标
- **WHEN** Agent 已理解用户目标，具备完成 Buildr 动作所需的工具和权限，且已取得该动作要求的授权
- **THEN** Agent MUST 直接执行该 Buildr 动作并验证结果
- **AND** Agent MUST NOT 把命令或操作步骤作为默认交付结果要求用户代为执行

#### Scenario: 动作需要用户授权
- **WHEN** Agent 能完成 Buildr 动作但该动作需要用户确认范围、影响或写操作授权
- **THEN** Agent MUST 先说明必要影响并请求授权
- **AND** 用户确认后 Agent MUST 直接执行，而不是再次要求用户手动操作

#### Scenario: 手动操作作为兜底
- **WHEN** 用户明确选择手动方式，或 Agent 因工具不可用、权限、登录态、外部环境等原因无法完成动作
- **THEN** Agent MUST 提供准确、可执行的手动操作方式
- **AND** Agent 无法执行时 MUST 说明具体阻塞原因

### Requirement: 公开产品模型区分 Workspace、Project 与 Skill destination
Buildr 公开入口 MUST 将 Workspace 说明为工作目录和 Skill 治理根，将 Project 说明为业务与依赖节点，并将 user/workspace 说明为两种 Agent Skill runtime destination。

#### Scenario: README 解释 Skill 生命周期
- **WHEN** README 介绍 Skill 创建、复用和安装
- **THEN** README MUST 说明 Skill 先在 workspace `skills/` 管理
- **AND** MUST 说明它可显式 render 到用户层或当前 workspace 层
- **AND** MUST NOT 将 Project 描述为 Buildr 能保证的 Skill 使用范围

#### Scenario: README 解释 Project 专用 Skill
- **WHEN** README 举例说明只适用于某 Project 的工作流程
- **THEN** README MUST 将其描述为 workspace Skill 加 Project applicability/capability context
- **AND** MUST 保留 workspace 的跨 Project registry 和依赖语义

### Requirement: 公开入口准确说明同名 Skill 治理
Buildr 公开文档 MUST 说明 Agent runtime 可能允许同名 Skill 共存，但 Buildr 对受管候选使用 identity、ownership 和 digest 执行确定性冲突治理。

#### Scenario: 用户比较 Agent 与 Buildr 行为
- **WHEN** 用户询问同名 Skill 是否覆盖
- **THEN** 文档 MUST 区分 Agent 自身行为与 Buildr 受管投射保证
- **AND** MUST NOT 声称 Agent Skills 规范提供全局唯一 ID 或稳定覆盖优先级

### Requirement: README 必须直接说明 Buildr 适用的问题和场景
Buildr 公开 README MUST 在要求读者理解内部资产模型之前，用直接、具体、可代入的语言说明 Buildr 适合解决什么问题以及用户可以拿它做什么；场景 MUST 使用真实当前能力，不得把 Roadmap 或 Agent 自身能力表述为 Buildr 已实现功能。

#### Scenario: 首次访问者判断是否需要 Buildr
- **WHEN** 读者第一次查看 README 首屏和快速开始前内容
- **THEN** README MUST 至少覆盖重复解释项目背景、多 repo/Service 关系割裂、工作方法停留在聊天或个人经验、切换 Agent 需要重建环境等具体问题
- **AND** MUST 用一句普通语言说明 Buildr 将项目事实和工作方法组织成 Agent 可持续使用的工作资产
- **AND** 读者 MUST NOT 需要先理解 Rules、Skills、Components、Commands 或 runtime adapter 才能判断产品价值

#### Scenario: README 展示可执行使用场景
- **WHEN** README 举例说明用户可以拿 Buildr 做什么
- **THEN** 场景 MUST 包括组织现有业务与代码仓、让 Agent基于项目事实继续工作、沉淀可复用工作方法或接续长期任务中的至少三类
- **AND** 场景 MUST 使用普通用户可表达的目标，而不是把 `project create`、`service create`、sync 或 capability 参数当作用户价值示例

### Requirement: README 快速开始必须引导第一次有效工作
Buildr 公开 README MUST 将普通用户快速开始从安装延伸到 Workspace、Project、可选 Service 和第一项真实工作，并 MUST 把 runtime discovery、init 和 doctor 描述为 Agent 的确定性执行与验证细节，而不是普通用户必须学习的主流程。

#### Scenario: 用户复制第一次使用指令
- **WHEN** 普通用户阅读 README 快速开始
- **THEN** README MUST 提供一段可以直接交给 Agent 的自然语言指令
- **AND** 该指令 MUST 要求 Agent 检查并安装 Buildr、确认 Workspace、引导 Project/Service、执行和验证必要动作，并在完成后询问第一项工作
- **AND** 指令 MUST NOT 要求用户预先提供 runtime adapter id、CLI 参数或完整 Buildr 资产分类

#### Scenario: README 解释最小用户心智
- **WHEN** 快速开始解释初始化后会发生什么
- **THEN** README MUST 将 Workspace 说明为用户与 Agent 共同工作的顶层目录，将 Project 说明为业务、产品、系统或长期工作，将 Service 说明为 Project 中可选的代码仓、应用、模块或可执行资产
- **AND** MUST 明确三者是帮助用户理解工作范围的最小模型，不是每次对话都必须填写的三个参数

#### Scenario: README 提供两种开始方式
- **WHEN** README 说明如何使用 Buildr
- **THEN** MUST 分别说明通过 Buildr Web 建立和查看工作范围、通过 Agent 对话完成 onboarding 的路径
- **AND** MUST 说明 Buildr Web 负责认知、低风险维护和交接，Agent 负责理解、执行与验证
- **AND** 任一路径 MUST NOT 成为另一条路径的强制前置条件

#### Scenario: README 后置技术安装细节
- **WHEN** README 展示 Node、npm、development checkout、runtime list、init 或 doctor 命令
- **THEN** 这些内容 MUST 位于普通用户第一次使用指令和成功路径之后，或明确标记为 Agent/手动兜底信息
- **AND** README MUST 链接 CLI Reference、Runtime Adapters 和产品说明承载深入机制
- **AND** MUST NOT 在 README 重复维护完整 CLI 手册

#### Scenario: README 定义第一次成功
- **WHEN** README 说明快速开始的完成结果
- **THEN** MUST 将用户能够确认 Workspace、Project、可选 Service 并向 Agent 提出第一项真实目标作为第一次有效工作的入口
- **AND** MUST 将 doctor ready 保留为 Agent 判断技术 onboarding 完成的证据
- **AND** MUST NOT 把只运行安装命令或 init 描述为用户已经会使用 Buildr

### Requirement: 产品说明必须定义 Buildr Web 的人机桥梁边界
Buildr 产品说明 MUST 将 Agent 定义为理解、推理、规划和专业执行入口，将 Buildr Web 定义为人的认知与治理入口以及向 Agent 交接 canonical 工作范围的界面；二者 MUST 共享 Workspace 源资产，不得形成两个竞争的任务执行主体。

#### Scenario: 产品说明解释 Buildr Web 价值
- **WHEN** README 或产品主说明介绍 Buildr Web
- **THEN** MUST 说明 Buildr Web帮助人理解 Workspace、Project、Service、真实状态和低风险 metadata，并生成交给 Agent 的受约束 prompt
- **AND** MUST 说明真正的 Project/Service 创建、迁移、修复和专业任务由 Agent 在核对边界与授权后执行

#### Scenario: 评审 Buildr Web 新能力
- **WHEN** 产品准备在 Buildr Web 增加对话、自动规划、任务执行或 Agent session 管理能力
- **THEN** 设计 MUST 单独证明该能力的长期治理、跨 Agent 复用、确定性约束或可验证诊断价值
- **AND** 如果能力只是复制 Agent 的通用理解、推理、规划、对话或专业执行，MUST 将其保留给 Agent

#### Scenario: Buildr Web 与 Agent 状态一致
- **WHEN** Agent 修改 Workspace、Project 或 Service 后用户打开 Buildr Web
- **THEN** Buildr Web MUST 从同一 source authority 读取最新事实
- **AND** MUST NOT 依赖独立数据库、聊天记录或页面 onboarding 状态解释 canonical 资源关系

### Requirement: 产品说明区分智能体软件、产物与工作资产
Buildr 产品说明 MUST 将智能体软件（Agentic Software）解释为引入智能体参与理解用户目标、判断或执行工作并交付产品结果的软件，允许渐进演进；仅使用智能体开发软件不自动使其成为智能体软件。产物（Artifact）MUST 包含工作中形成或改变的中间成果与最终结果，不限于文件，可由 Git、数据记录或外部系统承载。产物 MUST 不因被生成或使用而自动成为工作资产（Work Asset）。

#### Scenario: 解释产品设计原则与技能
- **WHEN** 产品说明介绍智能体优先设计
- **THEN** MUST 说明根规则保存原则与边界，按需技能提供应用方法，不维护第二套原则
- **AND** MUST 区分设计指导与当前实现，不声称 Buildr 已支持所有外部产物的实时同步或统一编辑

#### Scenario: 外部结果作为产物
- **WHEN** 任务通过外部系统产生业务结果
- **THEN** MUST 以外部系统的可核验结果为依据，不用聊天声明或本地副本替代真实结果
- **AND** MUST 不要求为此新建 Buildr 受管资产或产物数据库
