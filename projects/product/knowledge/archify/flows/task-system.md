# 任务系统总图的事实依据

范围：以涉及 OpenSpec 的完整实现任务为例，连接需求讨论、任务分流、工作树（Worktree）、方案、两类审查、实施授权、交付与适用自举。依据 `dev` 的 `1e353c9e`。边界按人、智能体（Agent）、Buildr 的职责划分；箭头表达协作和常见先后关系，不是产品强制的统一状态机。

[精简主文](../../docs/architecture/task-system.md) · [代码地图](../../code-map/task-system.md) · [总图](task-system.html) · [图源](task-system.json)

## 总图节点与职责

| 节点 | 职责与来源 |
| --- | --- |
| `discuss` | 人表达目标、约束与已有授权；[核心规则](../../../services/buildr/resources/workspace/AGENTS.md) |
| `triage` | 智能体（Agent）判断范围、语义和执行形态；[任务分流](../../../services/buildr/resources/workspace/skills/buildr/task-triage/SKILL.md) |
| `foundation` | Buildr 治理规则（Rule）、技能（Skill）和能力绑定，管理工作空间（Workspace）、项目与服务，按明确输入登记任务并准备隔离位置；[工作资产模块](../../../services/buildr/src/modules/agent-assets/module.ts)、[工作空间读取](../../../services/buildr/src/modules/workspace/application/workspace-query-application.ts)、[任务写入](../../../services/buildr/src/modules/task/application/task-command-application.ts)、[工作树提供者](../../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts) |
| `proposal` | 智能体（Agent）通过 OpenSpec 编写方案；[OpenSpec 提案技能](../../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md)及当前任务分流约束 |
| `planning-review` | 对实际方案审阅并记录结论；[审查技能](../../../services/buildr/resources/workspace/skills/buildr/task-review/SKILL.md)、[审查应用](../../../services/buildr/src/modules/task/application/task-review-application.ts) |
| `authorize` | 人决定方案与实施范围；仅缺少相关决定时需要新增确认，已有授权延续 |
| `implement` | 智能体（Agent）修改实现、直接运行测试并维护相关知识；[验证技能](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)、[知识维护技能](../../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md) |
| `completion-review` | 审查真实实现结果；验证报告独立记录实际检查和缺口；[审查应用](../../../services/buildr/src/modules/task/application/task-review-application.ts)、[验证应用](../../../services/buildr/src/modules/task/application/task-verification-application.ts) |
| `accept` | 人验收成果并明确收尾范围；[收尾技能](../../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md)，父任务授权另遵从[父任务协调](../../docs/flows/task-parent-coordination.md) |
| `deliver` | 智能体（Agent）完成精确提交、按约定集成、普通推送和真实回读；[收尾技能](../../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md) |
| `collaboration` | Buildr 通过工作台（Workbench）和任务详情连接人机协作，组织目标、方案、进展、审查、验证、交付结果及人的答复；[工作台应用](../../../services/buildr/src/modules/workbench/application/workbench-application.ts)、[摘要应用](../../../services/buildr/src/modules/task/work-context/application/work-context-application.ts)、[网页回应](../../../services/buildr-web/src/features/task/components/TaskWorkContextCard.tsx) |
| `delivery-support` | Buildr 提供交付支撑：已有任务结果登记、适用自举激活和资源清理分别由具体能力处理；[自举依据](task-self-bootstrap.md)，不形成一个新的聚合结果 |

工作基础贯穿整个过程，三个 Buildr 节点概括方法与现场、过程协作、交付支撑，不表示只在三个时点参与。当前记录覆盖关键结构化事实与文件关联，不包含完整对话转录或逐次工具日志；同一事实版本连接网页、接口和智能体（Agent），而非建立另一套执行引擎。

## 连线表达什么？

| 连线 | 交互或前后依赖 |
| --- | --- |
| `discuss-triage` | 智能体（Agent）理解人的目标，再选择工作方法 |
| `triage-worktree` | 正式变更需要已有任务记录，持久写入默认隔离；向 Buildr 提供明确对象与位置输入 |
| `worktree-proposal` | Buildr 提供当前工作方法、能力绑定和实际位置；智能体（Agent）依据方法在该目录中写方案 |
| `proposal-review` | 方案形成后按风险审阅，不把材料存在当作审查通过 |
| `review-authorize` | 向人展示可审阅方案、审查结论和仍需决定的事项 |
| `authorize-implement` | 在明确实施范围内继续；不是每次切换阶段都新增授权 |
| `implement-review` | 以实际实现和运行检查作为结果审阅对象 |
| `review-accept` | 人查看成果及检查结论，必要时给出验收或修改意见 |
| `accept-deliver` | 按已明确的交付范围执行；已有收尾授权时直接延续 |
| `deliver-bootstrap` | 已交付内容决定后续登记、自举适用性与资源处理，各项事实独立 |
| `implement-context` | 有值得接续的进展才记录；继续前重读人的意见和实际成果 |
| `human-context` | 人可从网页查看并保存意见；当前没有答复自动唤醒执行的实现 |

## 进一步查看真实交互

- [需求、方案与实施授权](task-system-planning.html)：[图源](task-system-planning.json)、[逐项依据](task-system-planning.md)。展开人、智能体（Agent）与 Buildr 的方案阅读和答复闭环。
- [实现审查与代码交付](task-system-delivery.html)：[图源](task-system-delivery.json)、[逐项依据](task-system-delivery.md)。区分执行、审查、人的验收授权和实际交付。
- [自举激活与安全善后](task-self-bootstrap.html)：[图源](task-self-bootstrap.json)、[逐项依据](task-self-bootstrap.md)。展示唯一执行器和保留工作现场的交互。

## 现有表述差异

| 来源 | 与当前实现的差异 |
| --- | --- |
| [自举编排规范](../../../openspec/specs/task-closeout-orchestration/spec.md) | 仍写有任务完成前置要求；当前唯一脚本不读取任务状态，任务编号可选。已确认的移除决定见[归档变更](../../../openspec/changes/archive/2026-09-08-remove-self-bootstrap-task-prerequisite/specs/agent-task-workflows/spec.md)。 |
| [任务工作方式规范](../../../openspec/specs/agent-task-workflows/spec.md)中的旧工作树场景 | 仍描述自动 Doctor 与同步；当前工作树（Worktree）提供者只管理 Git 位置和具体删除安全。 |
| [任务环境退役规范](../../../openspec/specs/task-environments/spec.md)的普通编辑场景 | 沿用可原地修改的旧描述；较新的任务分流要求持久写入默认隔离，用户明确要求原地修改时才例外。 |

图按已核对的当前实现表达，同时保留差异依据；本次不以改图代替规范承诺修订。网页读源的范围限制也不改变文件的真实职责。

## 检查口径

除 Archify 的生成、连线和桌面布局检查外，本轮逐项核对用户要求的阶段、参与者、交互内容及授权条件，并与「知识建设与维护」的主文和代码地图（Code Map）结构对照。图的可读性和文件完整性不代替任务系统本身的业务验证；具体视觉回执与人工查看结论保存在本轮本机验证记录中。
