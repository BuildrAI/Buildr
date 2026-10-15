# Tasks

## 1. 前端需求页与移除「用户确认」

- [x] 1.1 `services/buildr-web/src/features/task/components/taskWorkContent.ts`：`taskDocumentLabel` 中 `brief.md` 显示名由「需求说明」改为「需求」。
- [x] 1.2 `services/buildr-web/src/features/task/components/TaskNodeContent.tsx`：`requirements` 不再单独 `unshift` intent 目录项；`closeout` 不再 push `acceptance` 目录项。
- [x] 1.3 `services/buildr-web/src/features/task/components/TaskReadingPane.tsx`：新增需求阅读对象——intent 为「任务目标」小节 + brief 正文；无 brief 时直接渲染 intent 或空态。
- [x] 1.4 更新 `services/buildr-web` 前端相关断言/测试：无 brief 任务显示 intent、有 brief 任务显示需求正文、任务收尾不出现「用户确认」目录项。

## 2. Skill 与贡献文本

- [x] 2.1 `services/buildr/resources/workspace/skills/buildr/task-manager`（随包 SKILL 源）：intent 条款补充"一句话目标与入口"，说明多目标/边界/验收交给 brief.md，不写步骤清单或长篇正文。
- [x] 2.2 `components/buildr/openspec/contributions/openspec-apply-sidebar.md`：实现完成段补充"已执行且仍适用的检查在任务 active 时经 task-verification 登记正式报告；completed 后槽位锁死不可补登"。
- [x] 2.3 `services/buildr/resources/` 中 `task-finish` 源文本：把"未登记的审查或验证在任务仍为 active 时先补登"明确为先于 `task complete` 的顺序约束。
- [x] 2.4 `services/buildr/resources/` 中 `task-verification` 的 SKILL.md 与 `record-report.md`：明确每次 record 是该时点任务相关完整检查集合（非增量），且必须在实现完成、任务 `active` 时登记。

## 3. 核对

- [x] 3.1 `openspec validate clarify-task-requirements-verification --strict` 与 `buildr openspec convergence preflight` 通过。
- [x] 3.2 `buildr-web` 相关单测/构建与 `buildr` 相关检查按 verification.yml 受影响范围执行并通过。
- [x] 3.3 知识影响核对：`glossary.md` 中 brief/需求相关术语表述按需校准。
