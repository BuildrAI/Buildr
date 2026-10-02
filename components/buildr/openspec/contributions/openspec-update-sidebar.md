## Buildr OpenSpec Sidebar

组合后的执行口径：本增强的一组材料修订授权优先于后文逐文件确认提示；需要用户决定的语义变化仍须局部暂停。

用户已授权一组既有规划材料的修订时，在该范围内连续完成一致性修改，不逐文件重复确认。只讨论建议不构成写入授权；扩大范围、改变业务意图或出现真实语义冲突时，先完成独立且已授权的工作，再询问必要决定。本增强依据用户既有授权，不授予实现、同步或归档权限。

`openspec-update-change`只修订既有planning artifacts，不授予实现、同步或归档权限。纯规划修订也在写入前执行 `task-triage` 的默认隔离策略，复用已有当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。若需要新的实现、构建、测试或资源，核对同一实际工作根后转入`openspec-apply-change`。

若修订首次明确会产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）。已有原型且未被明确忽略时，后续实现应读取它；原型不是门禁或状态。

先读取由 `task-manager` 维护的任务记录（Task Record）`brief`，核对唯一任务说明（Task Brief）。整体理解、范围或完成依据变化时，由它按已观察 `recordDigest` 更新正文，不拉长 `intent` 或复制需求。任务可关联零到多个变更（Change），多任务可共享同一 Change 或方案文档；每个任务正文独立维护，不覆盖其他任务。

scope、核心流程、影响、验收或 delta requirements 改变时，刷新具体变更说明（Change Brief）`brief.md`、重新执行当前认知 `assess`，并更新 tasks 及已采用的 `.buildr/knowledge-impact.yml`。新说明只解释本次变化并通过稳定任务引用（如 `[任务说明](@task/<task-id>)`）指向记录中的唯一任务正文；适用已有文档时引用同一原文，不复制同义正文，不把任务正文委托给知识维护。任务引用限定当前工作空间，正文中的项目文档使用明确 `projects/<project>/<path>`，归档后任务身份不变；普通相对链接保留既有语义，旧说明与历史不批量改写。随后按材料及规则变化执行受影响的 strict validation；convergence preflight 还应核对相关规范和进行中变更。已有结果仍适用时复用，只补充缺失或受影响检查。Agent 直接依据当前 artifacts 与诊断决定如何修订、是否需要重新审查；Application不另存规划快照。

`tasks.md`只保留Change收敛前可完成的工作；任务验证、任务收尾、资源清理与Task终态不属于Change checklist。

当前知识协作使用 `buildr.current-knowledge-maintenance/v3`。已有建设授权内连续完成成果；范围外有价值缺口先给出具体建议，辅助记录和非关键漂移只形成局部提醒，不能阻止无关验证、同步或交付。
