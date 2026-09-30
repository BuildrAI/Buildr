# 需求：任务需求以 brief 为正文、intent 回归简短，验证报告在实施完成阶段登记

## 背景问题

任务详情页「任务需求」中 intent 与 brief 重复平铺（头部展示 intent、目录再给"任务目标"，两者内容常重叠），用户明确要求：intent 回归一句话目标与入口的简短定位，关联变更的 `brief.md` 正名为"任务说明"并作为需求正文。同时发现验证报告只在任务 `active` 时可登记，`completed` 后永久锁死——本次先完成再补登导致页面"尚未保存验证结果"永远无法写入；登记时点必须落在实施完成之后、任务 completed 之前，并由 `openspec-apply-change` 的 sidebar 贡献与 `task-finish` 指引明确。「用户确认」目录项在全部任务中几乎总为空，本轮直接移除，验收方案另行决定。

## 目标与范围

- `task-manager` 指导 intent 写为一句话目标与入口，不复述完整需求，不把实现步骤和验收细节塞入。
- Buildr Web 任务详情：说明节点以关联 brief（正名"需求"）为正文；无 brief 时如实显示 intent 正文；intent 不再与 brief 长段重复平铺，头部 intent 展示保持简短定位不变。
- `openspec-apply-change` sidebar 贡献与 `task-finish` 明确：验证报告在实施完成、任务仍为 active 时登记，completed 后不可补登。
- 收尾页移除常驻「用户确认」目录项。

## 非目标

- 不修改验收（acceptance）流程本身，不删除该项或改动 `task work-context` 语义，只调整展示条件。
- 不为已完成任务开放验证报告补登记（保持 `task_verification_task_terminal` 语义）；本任务的漏登按更正流程另行处置。

## 验收要点

- 有 brief 的任务：说明节点直接阅读需求正文，intent 以简短目标展示，不出现第三处长段重复。
- 无 brief 的任务：说明节点如实显示 intent 或空态。
- Agent 在实施完成阶段被明确指引登记验证报告；收尾页不再出现「用户确认」目录项。
