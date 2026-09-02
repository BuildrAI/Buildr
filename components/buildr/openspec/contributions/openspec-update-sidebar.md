## Buildr OpenSpec Sidebar

`openspec-update-change` 只修订既有 planning artifacts，不授予实现、同步或归档权限。纯规划修订可以直接使用当前 Change 现场；若需要新的实现、构建、测试、资源或执行位置，先为正式 Task 恢复匹配的 Task Environment，再转入 `openspec-apply-change`。

若修订首次明确会产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）。已有原型且未被明确忽略时，后续实现应读取它；原型不是门禁或状态。

scope、核心流程、影响、验收或 delta requirements 改变时，刷新 `brief.md`、重新执行当前认知 `assess`，并更新 tasks 与 `.buildr/knowledge-impact.yml`。随后运行 strict validation 和 convergence preflight。Agent 直接依据当前 artifacts 与诊断决定如何修订、是否需要重新审查；Application不另存规划快照。

`tasks.md` 只保留 Change 收敛前可完成的工作；任务验证、任务收尾、Environment cleanup 与 Task 终态不属于 Change checklist。
