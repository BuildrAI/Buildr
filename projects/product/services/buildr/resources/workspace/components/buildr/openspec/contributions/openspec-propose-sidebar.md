## Buildr OpenSpec Sidebar

用户只要求提案时，完成规划材料后停止。用户已明确授权同一目标的规划与实现时，既有授权不因调用规划技能（Skill）而失效；先完成并展示规划成果，再由智能体（Agent）接续 `openspec-apply-change`。规划动作自身仍只修改规划材料。范围或业务决定改变时才请求必要确认，不能用本增强推导新的授权。

创建 Change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 Change ID；status 解析后，在写入前报告实际 `changeRoot`。

先取得正式Task Record并核对实际工作位置。Agent可以在已确认的当前Workspace直接工作；需要隔离时显式创建并检查matching Worktree，再使用返回的真实checkout。创建顺序为：`openspec new change`、`task update --add-change`、写proposal/design/specs/tasks。Application不额外保存规划快照；Agent直接读取当前artifacts判断是否完整、是否需要审查以及下一步做什么。

若可能产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）；已有原型且未被明确忽略时，实现应读取它。原型不是门禁或状态。

完整 planning artifacts 必须有适用于当前材料的 `openspec validate <change> --strict` 与 `buildr openspec convergence preflight` 结果。后续动作复用仍适用的结果；材料、检查规则或相关进行中变更变化时，只刷新受影响检查，不创建新的检查状态库。Agent 根据当前诊断处理 active Change 冲突、上游规范诊断或规范条目冲突，不把诊断转写为统一许可、Review Result 或 Application 状态。Planning Review 可由 Agent 按风险选择；审查对象直接使用当前 OpenSpec artifacts 或其专业接口已返回的身份。

读取当前认知维护（Current Knowledge Maintenance）能力，创建或刷新`brief.md`，执行`assess`，并把真实地图、技术图、解释文档与适用术语影响写入 tasks；已有 `.buildr/knowledge-impact.yml` 时同步维护，不要求第二份影响清单。写`tasks.md`时只包含Change收敛前可完成的实现、当前认知和直接验证动作；任务验证、任务收尾、资源清理与Task终态不属于Change checklist。

当前知识协作使用 `buildr.current-knowledge-maintenance/v3`。已有建设授权内连续完成成果；范围外有价值缺口先给出具体建议，辅助记录和非关键漂移只形成局部提醒，不能阻止无关验证、同步或交付。
