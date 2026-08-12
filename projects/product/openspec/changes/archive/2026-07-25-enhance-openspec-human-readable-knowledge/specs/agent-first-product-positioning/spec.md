## MODIFIED Requirements

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
