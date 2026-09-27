# Buildr 产品架构

本文解释 Buildr 如何连接工作范围、长期资料、智能体（Agent）执行和人的参与。使用场景见[整体认识](../overview.md)，已交付范围见[当前能力与边界](../overview.md)，工程组成见[技术架构](technical.md)。

设计边界依据[随包核心规则](../../../services/buildr/resources/workspace/AGENTS.md)和[产品定位规范](../../../openspec/specs/agent-first-product-positioning/spec.md)。本页解释这些边界，不另建一套规则。

## 协作与职责

人表达目标、约束和判断，给予授权并验收结果。智能体（Agent）核对当前资料，选择方法，组合工具并执行工作。Buildr 维护可长期复用的依据，提供共同的阅读和维护入口，并保护具体写入。

Buildr Web 面向人的理解与直接操作；技能（Skill）和命令行接口（CLI）面向智能体（Agent）的发现与调用。它们访问同一对象及其当前来源。对话可以解释工作，但不能成为业务状态的唯一依据；页面生成的指令也不等于执行已经开始。

## 工作范围如何组织

| 对象 | 回答的问题 | 关系与边界 |
|---|---|---|
| 工作空间（Workspace） | 我们共同工作的目录和发现入口在哪里？ | 承载登记与长期资产；不是所有内部文件都受管 |
| 项目（Project） | 要实现什么业务目标或长期工作？ | 维护业务资料、适用方法和实现关联；可以先于代码建立 |
| 服务（Service） | 哪一部分实现承担这项职责？ | 可被多个项目（Project）引用，并引用一个代码库实例（Repository Instance） |
| 代码库实例（Repository Instance） | 实际使用哪份代码，来源和位置是什么？ | 可承载多个服务（Service）；登记事实与当前检出状态分别核对 |

这些关系帮助从业务目标找到实现，不要求固定的目录树，也不自动合并所有引用方的规则。任务涉及哪些范围，就核对相应资料和实际代码位置。具体关系、共享与修改影响见[项目、服务与代码库如何协作](project-service-repositories.md)。

## 资料如何成为可用上下文（Context）

工作资产（Work Asset）是经过明确组织和治理、适合长期维护的工作事实与工作方法。规则（Rule）表达边界，技能（Skill）表达可复用方法，规范（Specification）表达应满足的行为，命令（Command）声明外部工具，组件（Component）组织相关资产。它们只是当前承载形式，实际代码和外部系统仍可保存自身的事实。

| 范围 | 含义 |
|---|---|
| 工作信息空间（Work Information Space） | 潜在可用于工作的全部来源，包括文件、数据库、网页、用户输入和工具结果 |
| 共享工作环境（Shared Work Environment） | 其中经过治理的长期资产及发现入口，为不同参与者提供共同依据 |
| 任务上下文（Task Context） | 智能体（Agent）针对当前目标，从实际来源中发现、核对并组织的信息 |
| 请求上下文（Request Context） | 本次调用选入的输入，受上下文窗口（Context Window）容量限制 |

Buildr 组织来源与关系，智能体（Agent）判断相关性。资料被登记不表示会全部装入一次调用，也不表示目标工具已经加载。技能（Skill）源文件在工作空间（Workspace）的 `skills/` 中维护，可投射到用户层或当前工作空间（Workspace）层；项目（Project）通过适用性和能力绑定（Capability Binding）表达需要的方法。具体适配、来源和冲突处理见[技能体系](buildr-skill-system.md)。

## 工作怎样留下可接续成果

| 内容 | 负责保存什么 | 不能据此推断什么 |
|---|---|---|
| 任务记录（Task Record） | 目标、范围、状态、关系和结果摘要 | 代码已经交付、智能体（Agent）正在运行 |
| 工作摘要（Work Context） | 当前进展、下一步、明确待处理事项及人的答复 | 保存答复会自动继续执行 |
| OpenSpec 变更 | 提案、设计、规范（Specification）和实施清单 | 每项工作都必须采用相同步骤 |
| 审查（Review）与验证（Verification）结果 | 各自的结论、依据、适用内容和未覆盖项 | 一个结果可以替代所有其他检查或实际交付 |
| 实际产物（Artifact） | 代码、文件、数据及外部系统中形成的中间或最终结果 | 产物（Artifact）自动成为受管工作资产（Work Asset） |

继续工作时，智能体（Agent）重读这些来源，核对变化后推进。任务记录（Task Record）、工作摘要（Work Context）及专业结果各自维护必要事实；局部读取失败不应隐藏其他可用成果。父子任务（Task）的关系帮助组织目标与结果，不传播工作位置或交付结论。

开发由智能体（Agent）直接调用项目工具完成；任务收尾（Task Finish）组合交付、已有记录更新和安全善后。复盘由用户明确要求后生成，建议不会自动转为新工作。详细行为集中在[任务系统](task-system.md)、[任务收尾](task-system.md)、[父任务协调](task-system.md)和[测试与验证](workspace-testing-and-verification-framework.md)。

## 数据与分发边界

长期源资产以文件保存，可由 Git 管理。当前本机形态使用工作空间结构化存储（Workspace Structured Store），以每个工作空间（Workspace）独立的 SQLite 保存任务（Task）和相关结构化记录。每日演进另存于本机文件；复盘正文也属于本机资料。这些内容不作为数据库文件同步协议，具体归属与恢复方式见[本机数据说明](buildr-data-design.md)。

正式分发载体是 npm 包，包含命令行接口（CLI）、产品逻辑、本机网页运行时（Runtime）、前端构建产物及所需资源。Buildr Web 启动器（Launcher）绑定同一 npm 安装；前端服务（Service）负责构建，后端服务（Service）负责本机托管。两者共享产品能力，不各建一套业务状态。详见[Buildr 后端](technical.md)与[Buildr 前端](technical.md)。

## 约束保护具体动作

Buildr 的硬门禁（Hard Gate）保护授权、对象身份、内容保全、外部副作用和真实结果。继续会写错对象、覆盖他人内容或造成完成误报时，应停止对应动作；辅助记录缺失、推荐流程或工具偏好不应阻止其他安全工作。

待处理（Attention）表示已有结果仍成立，但需要另行修复或跟进；建议（Advice）用于改善工作。`ready|required|blocked` 只表达具体动作所需条件，不是智能体（Agent）的全局工作许可。分类和设计依据见[门禁分类与有界审计](product.md)。

## 设计方法与未实现范围

软件引入智能体（Agent）参与目标理解、判断或执行并交付产品结果时，开始向智能体软件（Agentic Software）演进。相关设计可使用[智能体优先设计技能](../../../services/buildr/resources/workspace/skills/buildr/agent-first-design/SKILL.md)。仅使用智能体（Agent）开发普通软件，不自动要求该软件采用这种架构。

上述模型允许文件、Git、数据和外部系统分别承载真实成果，不要求新建统一产物（Artifact）数据库。当前并未实现任意外部成果的实时同步、统一编辑或完整远程组织协作。未来方向见[产品方向](../directions.md)，概念定义见[术语表](../glossary.md)。
