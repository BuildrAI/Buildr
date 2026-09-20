# 实现审查与代码交付的时序依据

[图示](task-system-delivery.html) · [图源](task-system-delivery.json) · [总图](task-system.html)。依据 `dev` 的 `1e353c9e`，接续已明确的实施范围。`human`、`agent`、`buildr`、`artifacts` 分别为人、智能体（Agent）、Buildr 与真实工作现场，职责沿用[规划时序](task-system-planning.md)。

| 交互 | 事实依据与边界 |
| --- | --- |
| `implement` | 智能体（Agent）修改代码、直接执行测试并维护相关知识；[验证技能](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)、[知识维护技能](../../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md) |
| `converge-change` | 智能体（Agent）核对规范与知识收敛，只在目标包含时归档；[OpenSpec 实施技能](../../../services/buildr/resources/workspace/skills/openspec/openspec-apply-change/SKILL.md)及当前分流、授权边界 |
| `completion-review` | 实现结果审查与任务验证报告是两个独立动作，只有实际检查完成后才保存结论；[审查应用](../../../services/buildr/src/modules/task/application/task-review-application.ts)、[验证应用](../../../services/buildr/src/modules/task/application/task-verification-application.ts) |
| `present-result` | 智能体（Agent）向人展示实际成果、检查结论与未解决事项，不从记录存在推断业务完成 |
| `authorize-finish` | 收尾范围尚未获得授权时，由人明确；已有授权在同一范围内继续有效 |
| `deliver-git` | 按约定完成精确提交、集成、普通推送并回读真实目标；[收尾方法](../../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md) |
| `complete-record` | 保存已有任务完成摘要并校验当前版本；[任务写入应用](../../../services/buildr/src/modules/task/application/task-command-application.ts)不执行 Git、部署或清理 |

正式审查与验证报告当前只允许在任务为 `active` 时写入，图按这个局部依赖排列。父任务完成仍需总体验收、直接子任务处置与明确指向该父任务的授权；普通收尾不扩大为发布、强推或丢弃内容。后续适用动作见[自举与善后时序](task-self-bootstrap.md)。
