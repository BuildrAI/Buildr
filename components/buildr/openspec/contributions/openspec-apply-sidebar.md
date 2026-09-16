## Buildr OpenSpec Sidebar

已授权实现遇到可逆且范围内的普通错误时，智能体（Agent）自行定位、修复并复查受影响内容。仅在业务语义无法确定、需要扩大授权、错误对象写入、覆盖他人工作或不可逆风险时局部暂停。不得绕过命令返回的 blocked 状态、缺失的必要材料或真实检查失败；先解决其原因，再继续。

应用Change前先向用户说明OpenSpec `apply` action、Change ID、实际`changeRoot`、Task ID与按默认隔离策略确认的实际工作根。

若 artifacts 表明会产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）。已有原型且未被明确忽略时，正式前端编辑前应读取它；原型不是审查、实现、验证、收敛或收尾门禁。

进入实现前，确认 apply-required artifacts 已完成，并核对已有 `openspec validate <change> --strict` 和 `buildr openspec convergence preflight` 结果。材料与检查规则未变时复用严格验证；冲突预检还需核对相关进行中变更及规范现场。结果缺失、相关输入变化或无法确认适用性时补跑对应检查，不因阶段切换或每次编辑重复执行。Agent 根据当前诊断处理依赖、修订 artifacts 或请求必要的用户决定；Application不另存规划快照，也不把 preflight 变成统一许可层。Planning Review 由 Agent 按目标与风险独立选择。

写入前执行 `task-triage` 的默认隔离策略，复用已确认的当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。核对实际Git checkout、Project/Service registry、owned scope与适用Worktree evidence；不得从cwd、branch、路径相似、旧Receipt或同一HEAD猜ownership。实现期间只编辑Change artifacts与实现内容，不预写canonical specs。

完成实现、当前认知和直接验证反馈后，完成全部Change-owned checkbox；仅在用户目标包含归档时调用`buildr openspec converge`，只同步时使用独立同步入口。不得以任务验证、任务收尾、资源清理或Task终态替代Change checklist。Converge成功后，Agent直接读取归档结果和真实代码现场继续审查、验证与交付；没有额外研发回执。

实现期间执行 tasks 中的 Brief、当前认知与术语影响；发现新的长期事实影响时同步更新 tasks 及已采用的 `.buildr/knowledge-impact.yml`。按真实影响执行 `reconcile`；仅解释文档变化时检查文档与引用，复用仍适用的代码测试。

当前知识协作使用 `buildr.current-knowledge-maintenance/v3`。已有建设授权内连续完成成果；范围外有价值缺口先给出具体建议，辅助记录和非关键漂移只形成局部提醒，不能阻止无关验证、同步或交付。
