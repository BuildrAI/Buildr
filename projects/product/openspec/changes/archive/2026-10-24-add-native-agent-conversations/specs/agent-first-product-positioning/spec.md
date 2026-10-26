## MODIFIED Requirements

### Requirement: Buildr 不复制 Agent 的通用工作能力
Buildr 产品治理核心与公共交互服务 MUST NOT 将自身定位或设计为通用智能体（Agent），也 MUST NOT 接管执行者（Executor）的通用理解、推理、规划、回复生成、工具选择和专业任务执行职责。Buildr 产品核心 MUST 聚焦组织工作资产治理、智能体（Agent）可发现入口、运行时（Runtime）投射、确定性状态变更、完整性保护和诊断；可复用专业动作 MUST 由 Buildr 作为工作方法治理并交给智能体（Agent）使用，而不是实现为治理核心自身的推理或执行主体。

Buildr MUST 允许由独立 `buildr-agent` 服务（Service）维护交互入口、接入连接、统一可见记录、准确恢复和手动跨参与者接续，并通过执行者（Executor）契约调用实际工作能力。公共服务 MUST 仅承担交互与确定性协调，不能把治理、可见对话与推理循环合为一个主体。首版实际执行者（Executor）仅为 Codex、DSH 与 Qoder 原生运行时（Runtime）。未来自研 Buildr 智能体（Agent）如需建设 MUST 作为另一实际执行者（Executor）另行明确设计、能力与验收，通过同一公共边界服务 Buildr；本变更 MUST NOT 实现或宣称该自研能力已可用，也不要求未来实现伪装为外部厂家命令行（CLI）。

#### Scenario: 评审新增产品能力
- **WHEN** 维护者评审一项拟进入 Buildr 的产品能力
- **THEN** 设计 MUST 说明该能力提供的长期治理、跨智能体（Agent）复用、确定性约束或可验证诊断价值
- **AND** 如果该能力只是在 Buildr 内复制智能体（Agent）已有的通用理解、推理、规划、回复生成或专业任务执行能力，设计 MUST 将其保留给实际执行者（Executor），不得加入 Buildr 产品治理核心或公共交互服务
- **AND** 如果该能力代表需要复用和治理的专业动作，设计 MUST 优先将其表达为智能体（Agent）使用的技能（Skill）或其他工作方法资产

#### Scenario: 产品说明解释 Buildr 与 Agent 的关系
- **WHEN** README、产品主说明或开发规则解释 Buildr 与智能体（Agent）的职责边界
- **THEN** 文档 MUST 说明 Buildr 产品治理核心为智能体（Agent）组织和准备开展工作所需的资产、入口与确定性边界，独立智能体服务（Agent Service）承载公共交互及接入，两者均不等同于实际执行者（Executor）
- **AND** 文档 MUST 保留智能体（Agent）发现相关内容、形成任务上下文（Task Context）、推理并推进任务的责任
- **AND** 文档 MUST 区分当前三家可用接入与未来可能建设的自研执行者（Executor），不能仅因存在 `buildr-agent` 目录就声称 Buildr 已具备自研智能体（Agent）

#### Scenario: 在 Buildr 内托管原生对话
- **WHEN** 人通过 Buildr 内部对话（Conversation）向已接入的原生智能体（Agent）表达目标或回应请求
- **THEN** Buildr MUST 维护准确输入、来源、可见记录和控制身份，原生智能体（Agent）继续负责理解、规划、选择工具及执行
- **AND** 统一可见记录 MUST 不被描述为三家共享同一内部上下文或迁移了隐藏推理
- **AND** 工作成果 MUST 继续以真实文件、业务系统和原有工作对象为权威，不依附于聊天副本

#### Scenario: 讨论未来自研智能体与外部智能体并存
- **WHEN** 维护者评估 Buildr 自研智能体（Agent）与外部智能体（Agent）共同服务 Buildr 的方向
- **THEN** 设计 MUST 将自研能力视为公共执行契约后的另一执行者（Executor），保留明确能力、权限、恢复与副作用边界
- **AND** 公共对话（Conversation）和工作对象身份 MUST 不因执行者（Executor）来自 Buildr 自研或外部厂家而重新定义
- **AND** 本变更 MUST 只保留该职责边界，不增加自研推理实现、自动分工或面向用户的占位执行选项

### Requirement: 产品说明必须定义 Buildr Web 的人机桥梁边界
Buildr 产品说明 MUST 将智能体（Agent）定义为理解、推理、规划和专业执行入口，将 Buildr Web 定义为人的认知与治理入口，以及向智能体（Agent）交接准确工作范围、承载原生执行交互的界面；二者 MUST 共享工作空间（Workspace）源资产，不得形成两个竞争的任务执行主体。内部对话（Conversation）MUST 可以保存跨参与者可见记录和准确原生会话（Session）引用，但不能成为工作资产（Work Asset）、任务（Task）状态或成果当前内容的第二权威。

#### Scenario: 产品说明解释 Buildr Web 价值
- **WHEN** README 或产品主说明介绍 Buildr Web
- **THEN** MUST 说明 Buildr Web 帮助人理解工作空间（Workspace）、项目（Project）、服务（Service）、真实状态和低风险元数据（Metadata），并通过准确材料或内部对话（Conversation）向智能体（Agent）交接要求
- **AND** MUST 说明真正的项目（Project）或服务（Service）创建、迁移、修复和专业任务由智能体（Agent）在核对边界与授权后执行

#### Scenario: 评审 Buildr Web 新能力
- **WHEN** 产品准备在 Buildr Web 增加对话、自动规划、任务执行或智能体（Agent）会话（Session）管理能力
- **THEN** 设计 MUST 单独证明该能力的长期治理、跨智能体（Agent）复用、确定性约束或可验证诊断价值
- **AND** 如果能力只是复制智能体（Agent）的通用理解、推理、规划、回复生成或专业执行，MUST 将其保留给智能体（Agent）
- **AND** 原生交互托管 MUST 明确连接、输入、事件、可见历史和恢复边界，不能以界面统一推导厂家能力或内部上下文完全等价

#### Scenario: Buildr Web 与 Agent 状态一致
- **WHEN** 智能体（Agent）修改工作空间（Workspace）、项目（Project）或服务（Service）后用户打开 Buildr Web
- **THEN** Buildr Web MUST 从同一源权威（Source Authority）读取最新事实
- **AND** MUST NOT 依赖独立数据库、聊天记录或页面引导状态解释权威资源关系

#### Scenario: 第一版保留图形与对话协作基础
- **WHEN** 内部对话（Conversation）引用任务、文件或已有系统对象
- **THEN** 引用 MUST 使用原对象身份、显式输入和可辨认来源，继续执行前核对当前事实
- **AND** MUST NOT 为此增加自动页面上下文、通用界面生成、成果导航或并行智能体（Agent）团队
