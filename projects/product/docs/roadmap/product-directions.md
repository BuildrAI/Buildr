# 产品方向汇总

本页汇总下一阶段的产品方向，并保留既有规划参考。三方协作与工作组织方式见[产品说明](../../knowledge/docs/overview.md)，已经交付的范围见[当前能力与边界](../../knowledge/docs/capabilities.md)。方向与示例不是现有功能清单，也不等于已经批准的实施契约；职责边界依据[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)，具体行为仍以相关正式规范与当前实现为依据。

## 下一步：连接更完整的产研体系

Buildr 将进一步抽象工作环境（Work Environment）与工作流（Workflow），并持续优化产品体验和技术架构。目标是让产研各方围绕共同目标、基于相互关联的上下文（Context），通过智能体（Agent）开展工作，提高效率与质量。

### 工作环境：在哪里、利用什么开展工作

工作环境（Work Environment）的进一步抽象，不只是收集工具地址或准备本机依赖，而是连接具体业务、资源与使用入口，使智能体（Agent）能发现工作对象、区分环境，并在适用的授权范围内使用相关能力。

后续接入方向包括：

| 系统或资源 | 需要连接的工作信息 |
|---|---|
| 不同环境的数据库 | 数据对应的业务、开发与测试及生产环境的区别、可执行操作的范围 |
| 持续集成与持续交付（CI/CD）工具 | 代码来源、检查入口、交付目标与实际执行结果 |
| Nacos 配置系统 | 应用与环境、配置内容、变更影响及实际生效情况 |
| XXL-JOB 定时任务系统 | 业务与任务的关系、触发条件、执行状态及结果 |
| Figma、墨刀等设计工具 | 需求、设计成果、实现与验收依据之间的关联 |

接通接口不等于接通工作：还需要明确对象身份、来源、当前版本、环境、授权和实际结果。专业系统继续维护自己的真实内容与结果，Buildr 连接来源、关系和使用入口，不必复制全部数据或替代原有工具。

### 工作流：怎样协作把事情做成

工作流（Workflow）的进一步抽象，将围绕一个目标连接阶段成果、适用方法、相互依赖、必要的人参与和完成标准，而不是只增加工具调用或把所有工作固化为一串操作步骤。

需要理解与判断的部分，保留给人和智能体（Agent）；稳定、重复且边界明确的部分，再沉淀为可复用方法或确定性动作。阶段衔接以实际成果为依据，不以记录的状态替代完成事实。已有工具能够可靠承担的执行与调度，不需要在 Buildr 中重建。

### 共同依据与产品体验

“共同的上下文（Context）”意味着围绕同一业务目标使用相关联、来源明确、可以重新核对的工作事实和方法，不要求所有人读取相同信息、拥有相同权限或使用同一个工具。Buildr 为人提供结构化、可视化的理解与参与方式，为智能体（Agent）组织可发现的来源与行动条件。

体验与技术架构的优化，应以真实工作是否更容易完成、成果是否更可靠为依据。既要减少重复解释、搬运和核对的成本，也要避免把一次使用变成额外的记录负担，或通过堆叠信息增加理解难度。

**不是存下资产就完成了，也不是接上工具就完成了，而是让资产真正参与工作，让工作持续产生价值。**

上述系统接入及通用抽象是后续方向，不是已经全部实现的承诺；不在本页预设统一执行引擎、固定岗位或一套必须照走的流程。

## 既有方向参考

以下保留原产品概览中的方向清单与设计候选，记录当时的规划表达，不证明各项当前仍未实现。采用前应核对当前规范和代码，不随本次文档整理改写历史设想；详细材料见[规划资料](./)。

- 以[产研工作平台（Product and Engineering Work Platform）产品与技术架构收敛纲领](product-engineering-work-platform.md)作为下一阶段收敛入口：以智能体和人为核心用户，维护产研工作资产，让任务管理从可用变得好用，并把智能体执行时长、调用次数和词元消耗（Token Consumption）作为一等产品指标；现有能力按通用核心、日常能力、可选受控能力、产品专用能力和删除候选逐步收敛。
- 以[Agent 时代的工作基础设施](agent-work-infrastructure.md)明确长期产品边界：Agent 负责理解任务、选择 Workspace 与资产、形成上下文、自行编排和专业执行；Buildr Application Core 提供 Enterprise、多 Workspace、外部数据源、长期工作资产与可接续共享状态。飞书、Agent 原生界面和 Buildr 界面具有不同的用户价值，彼此的接入与会话承载方式仍待验证；ACP 是未来可研究的 Agent 接入协议，不是上下文编排器。
- npm-only发布能力：同一Application Payload只生成一次npm tarball，所有Host Node/Launcher smoke、publish和Registry readback复用同一bytes；GitHub Release只保存版本说明且拒绝binary Assets。真实tag、publish与公开readback仍由独立release授权触发。
- 更多 Agent runtime adapters；每个新增 runtime 仍需独立 change 明确 identity、兼容版本、投射 targets 和 contract tests，不能借用现有 adapter fallback。
- 更完整的 Skills registry、版本策略、强制 integrity policy 和 package 型远端解析；当前已支持 manifest、resolved `skill-url`、version/integrity metadata 和有界网络读取。
- 权限裁剪和治理门禁。
- 推进[Agent 自编排与上下文接续](agent-context-orchestration.md)：由 Agent 根据任务跨 Workspace 检索，动态加载 Rules、Skills、Commands 和 Tools，自行提出 Task DAG、选择 subagent 或其他 Agent；Buildr 保存需要跨会话和跨 Agent 接续的 Task State、Decision 与 Evidence，不实现固定角色路由或通用 Planner。
- 将[历史角色能力拆解](agent-roles/)继续拆成按任务动态加载的 Rules、Skills、Packages 和 capability contracts，不把岗位身份作为 Agent 的固定运行模型。
- 评估[原型开发能力设想](prototype-development.md)是否应沉淀为可复用 Skill 或其他受管工作流。
- 更强的 project/service 资产同步与诊断。
- 继续收敛 Rule / Skill 分层；Rule 控制 Agent 的价值观、边界和约束，Skill 封装可复用的专业动作，场景化流程优先下沉为 Skill。
- 从文件系统/Git 逐步演进到可选的结构化存储和组织服务。

这些方向进入实现前，应先通过 OpenSpec change 收敛为可实施的需求和任务。
