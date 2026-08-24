## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: 产品说明必须定义 local app 的人机桥梁边界

