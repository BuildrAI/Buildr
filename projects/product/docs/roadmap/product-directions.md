# 产品方向汇总

> 从原产品概览保留的方向清单。它记录当时的规划表达，不证明各项当前尚未实现；采用前核对当前规范和代码，不随实现自动改写历史设想。

本节只概括后续产品方向。详细设计候选见 [Roadmap 资料](./)；这些资料不是当前产品事实、可执行资产或已经批准的实施契约。当前实现以 [Buildr current knowledge](../../knowledge/docs/capabilities.md) 为准，规范性行为以 [OpenSpec specs](../../openspec/specs/) 为准；具体方向进入实现前仍需创建独立 OpenSpec change。

后续产品方向包括：

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
