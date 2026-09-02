## Buildr OpenSpec Sidebar

创建 Change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 Change ID；status 解析后，在写入前报告实际 `changeRoot`。

先取得正式 Task Record 和匹配的 Task Environment。预计修改代码、构建或测试时使用隔离执行根；明确只维护 OpenSpec、规则、Skill、文档或模板时可以使用共享执行根。创建顺序为：`openspec new change`、`task update --add-change`、写 proposal/design/specs/tasks。Application 不额外保存规划快照；Agent 直接读取当前 artifacts 判断是否完整、是否需要审查以及下一步做什么。

若可能产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）；已有原型且未被明确忽略时，实现应读取它。原型不是门禁或状态。

完整 planning artifacts 必须通过 `openspec validate <change> --strict` 与 `buildr openspec convergence preflight`。Agent 根据当前诊断处理 active Change 冲突、Scenario 缺失、rename/identity 冲突或 projected validation，不把诊断转写为统一许可、Review Result 或 Application 状态。Planning Review 可由 Agent 按风险选择；审查对象直接使用当前 OpenSpec artifacts 或其专业接口已返回的身份。

读取当前认知维护（Current Knowledge Maintenance）能力，创建或刷新 `brief.md`，执行 `assess`，并把真实知识与术语影响写入 tasks 和 `.buildr/knowledge-impact.yml`。写 `tasks.md` 时只包含 Change 收敛前可完成的实现、当前认知和直接验证动作；任务验证、任务收尾、Environment cleanup 与 Task 终态不属于 Change checklist。
