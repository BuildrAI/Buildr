## Buildr OpenSpec Sidebar

应用 Change 前先向用户说明 OpenSpec `apply` action、Change ID、实际 `changeRoot`、Task ID 与 Task Environment 执行根。

若 artifacts 表明会产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）。已有原型且未被明确忽略时，正式前端编辑前应读取它；原型不是审查、实现、验证、收敛或收尾门禁。

任何实现编辑前，确认 apply-required artifacts 已完成，运行 `openspec validate <change> --strict` 和 `buildr openspec convergence preflight`。Agent 根据当前诊断处理依赖、修订 artifacts 或请求必要的用户决定；Application不另存规划快照，也不把 preflight 变成统一许可层。Planning Review 由 Agent 按目标与风险独立选择。

采用 Task Environment 时，只使用 `task environment inspect` 返回的 `execution.workdir`、`allowedExecutionRoots`、controller 与 `cliInvocation`，不得从 cwd、branch 或同一 HEAD 猜 ownership。实现期间只编辑 Change artifacts 与实现内容，不预写 canonical specs。

完成实现、当前认知和直接验证反馈后，完成全部 Change-owned checkbox，再调用单一 `buildr openspec converge` 事务执行 canonical sync/archive。不得以任务验证、任务收尾、Environment cleanup 或 Task 终态替代 Change checklist。Converge 成功后，Agent 直接读取归档结果和真实代码现场继续审查、验证与交付；没有额外研发回执。

实现期间执行 tasks 中的 Brief、当前认知与术语影响；发现新的长期事实影响时同步更新 tasks 与 `.buildr/knowledge-impact.yml`。实现内容完成后、最终验证前执行 `reconcile`。
