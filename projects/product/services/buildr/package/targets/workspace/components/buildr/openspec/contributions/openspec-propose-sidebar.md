## Buildr OpenSpec Sidebar

创建 change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 change id，不得静默创建。OpenSpec status 解析上下文后，在写 artifacts 前报告实际 `changeRoot`，不得猜测路径。

在执行 `openspec new change` 或写入任何 change artifacts 前，先取得正式 Task Record，并判断任务执行形态：

- 预计进入代码修改、构建、测试或需要长期开发上下文时，使用 `task-environment` 按 Task ID 准备完整 repository set，取得 `ready`、明确 execution roots、validation root 与执行 CLI 后再写入。
- 明确只创建或维护 OpenSpec artifacts、规则、Skills、文档或模板时，也使用 Task Environment；它可以选择共享执行根，不必创建 Git worktree。任务后来升级为实现时由同一 Environment `prepare` 恢复，不另建第二份 artifacts。
- 无法判断是否会进入实现时，先澄清执行范围，不得先创建 artifacts 再决定位置。

取得ready Environment后、写入首个Change artifact前，调用selected`buildr.task-development/v2`provider的`begin`建立研发回执；此时Content Target、policy、Candidate与专业Result保持缺失。每个proposal/design/specs/tasks current集合形成或改变后调用`planning`，只登记OpenSpec authority、相对artifact reference、content identity与disposition，不复制正文。若当前Task不存在该节点则不造占位；用户明确跳过时记录waiver source。

完整planning artifacts达到apply-ready后，使用Environment声明的Node与Buildr Service execution root调用`task-planning-identity-driver.mjs inspect --task <task-id> --target <canonical-workspace>`。只有`resolved`时才用返回的`target.identity`和全部`planningNodes`刷新Development planning并进入Planning Review；`blocked`时停止，禁止用文件路径、raw digest、mtime、checkbox progress、Git ref或旧Review target猜测。

该门禁只补充 Buildr 的任务位置与 Development 聚合事实，不修改外部 `openspec-propose` Skill 的上游正文，也不让 Task Environment 或 Development 判断是否需要 OpenSpec Change、生成 artifact 或取得其内容 authority。

完整 planning artifacts 形成后，读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider：创建或刷新同级 `brief.md`，执行 `assess`，并把真实 Brief/current knowledge/terminology impacts 写入 tasks 与 `.buildr/knowledge-impact.yml` evidence。没有真实内容的目标不得产生空文档任务；provider unresolved 或 dependency blocked 时将 Change 报告为 blocked，不得开始 apply。

写入或修订`tasks.md`的每个checkbox时，立即确认它能在Change convergence/archive前完成；只包含Change disposition前可完成的实现、当前认知、直接验证反馈与archive readiness动作，不为填写checklist预读完整下游流程。不得把Formal Development、Task Verification/Candidate、Completion Review、Task Finish、Environment cleanup、Task terminal state或其他只能在archive后发生的Task lifecycle动作写为Change checkbox。
