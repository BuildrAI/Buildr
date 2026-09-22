# 需求、方案与实施授权的时序依据

[图示](task-system-planning.html) · [图源](task-system-planning.json) · [总图](task-system.html)。依据 `dev` 的 `1e353c9e`，展示涉及正式任务与 OpenSpec 的规划场景。当前审查按风险选用，人也可直接在对话中答复；图中的网页路径用于解释跨入口接续。

| 参与者 | 职责 |
| --- | --- |
| `human` | 表达目标、约束及真实决定或授权 |
| `agent` | 核对事实、选择方法、写方案、审阅并继续执行 |
| `buildr` | 提供方法和具体接口，保存并呈现同一事实，保护版本与归属 |
| `artifacts` | 规范、代码、Git 和运行结果构成的真实现场 |

| 交互 | 事实依据 |
| --- | --- |
| `discuss-goal` | 人和智能体（Agent）讨论目标；[核心规则](../../../services/buildr/resources/workspace/AGENTS.md) |
| `triage-read` | 分流判断由智能体（Agent）完成，向 Buildr 读取实际范围和记录；[任务分流](../../../services/buildr/resources/workspace/skills/buildr/task-triage/SKILL.md) |
| `prepare-worktree` | 正式任务登记与工作树（Worktree）创建是两个可组合动作；[任务写入](../../../services/buildr/src/modules/task/application/task-command-application.ts)、[位置提供者](../../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts) |
| `return-location` | 返回已核对的位置、分支和记录版本，不声明统一环境就绪 |
| `write-openspec` | 智能体（Agent）按 OpenSpec 方法编写提案、设计、规格与清单；[提案技能](../../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md) |
| `planning-review` | 智能体（Agent）先形成实际审查，再保存结果；[审查方法](../../../services/buildr/resources/workspace/skills/buildr/task-review/SKILL.md)、[结果应用](../../../services/buildr/src/modules/task/application/task-review-application.ts) |
| `record-attention` | 进展及方案入口写入摘要，确实需要人处理时才登记事项；[工作摘要应用](../../../services/buildr/src/modules/task/work-context/application/work-context-application.ts) |
| `read-attention` | 人打开或刷新网页，读取同一当前事项与材料；[工作台页面](../../../services/buildr-web/src/features/workbench/pages/WorkbenchPage.tsx) |
| `respond-plan` | 人保存实际意见，带已观察摘要与事项身份；[回应组件](../../../services/buildr-web/src/features/task/components/TaskWorkContextCard.tsx)、[摘要应用](../../../services/buildr/src/modules/task/work-context/application/work-context-application.ts) |
| `reread-answer` | 智能体（Agent）继续前主动读取答复及真实现场；[任务管理](../../../services/buildr/resources/workspace/skills/buildr/task-manager/SKILL.md) |
| `return-answer` | 返回已保存的文本和版本，答复本身不自动执行、授予通用权限或完成任务 |

图中“保存实施授权”表示保存人的真实原意；智能体（Agent）仍须依据原文核对具体对象、范围和副作用。Buildr 不独立认证自然语言授权，也不把审查通过当作实施许可。已有同范围授权延续，不重复制造确认。
