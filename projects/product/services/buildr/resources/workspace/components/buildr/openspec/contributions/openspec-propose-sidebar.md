## Buildr OpenSpec Sidebar

创建 change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 change id，不得静默创建。OpenSpec status 解析上下文后，在写 artifacts 前报告实际 `changeRoot`，不得猜测路径。

若用户目标或本次 planning artifacts 可能产生用户可见前端 UI 变化，确认用户是否需要界面原型（UI Prototype）。只有当前任务已有明确确认，才在 proposal/design/spec 已提供足够上下文后、正式前端实现前加载 selected `ui-prototype` Skill；用户拒绝、未确认或要求继续时不生成并继续 OpenSpec 流程。当前 Task 已有原型且用户未明确要求忽略时，后续 apply 必须读取全部相关原型并按其信息架构、布局和交互开发，同时把正式行为写入对应 artifacts。不得把原型变成 planning node、Review gate、waiver、Result 或 blocker。

在执行 `openspec new change` 或写入任何 change artifacts 前，先取得正式 Task Record，并判断任务执行形态：

- 预计进入代码修改、构建、测试或需要长期开发上下文时，使用 `task-environment` 按 Task ID 准备完整 repository set，取得 `ready`、明确 execution roots、validation root 与执行 CLI 后再写入。
- 明确只创建或维护 OpenSpec artifacts、规则、Skills、文档或模板时，也使用 Task Environment；它可以选择共享执行根，不必创建 Git worktree。任务后来升级为实现时由同一 Environment `prepare` 恢复，不另建第二份 artifacts。
- 无法判断是否会进入实现时，先澄清执行范围，不得先创建 artifacts 再决定位置。

取得ready Environment后，若本次要创建OpenSpec变更，固定顺序为：先`openspec new change`形成可解析脚手架，再`task update --add-change`绑到Task Record，再调用selected`buildr.task-development/v4`provider的`begin`（disposition覆盖任务上全部变更），最后才写入proposal/design/specs/tasks。不得在脚手架不存在时`add-change`，也不得对空变更列表`begin`后再绑定即将写入的变更。无变更的code-only任务仍可在首个实现前`begin`空列表。`begin`时Content Target、policy、Candidate与专业Result保持缺失。每个proposal/design/specs/tasks current集合形成或改变后调用`planning`，只登记OpenSpec authority、相对artifact reference、content identity与disposition，不复制正文。若当前Task不存在该节点则不造占位；用户明确跳过时记录waiver source。若事后绑定变更导致任务上下文过期，必须重新`begin`或`planning`，不得沿用过期研发回执。

完整planning artifacts达到apply-ready并通过`openspec validate <change> --strict`后，先从matching Environment Receipt取得`execution.workdir`并运行`buildr openspec convergence preflight <change> --project <project> --target <task-execution-root> --json`。Preflight `blocked`时在apply前停止，由Agent按active Change conflict、Scenario omission、rename/identity conflict或projected validation诊断处理语义后重跑strict与preflight；不得把诊断写入Review Result代替处理。只有current `ready`时，才使用matching `task environment inspect`返回的retained controller调用`__internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>`，用`resolved`结果的`target.identity`和全部`planningNodes`刷新Development planning；不得使用candidate `cliInvocation`或source driver。resolver `blocked`时停止，禁止用文件路径、raw digest、mtime、checkbox progress或Git ref猜测。Agent可按目标独立执行Planning Review，但它不是apply或Development门禁。Preflight ready不是写入授权，最终converge仍按最新事实重新检查。

该门禁只补充 Buildr 的任务位置与 Development 聚合事实，不修改外部 `openspec-propose` Skill 的上游正文，也不让 Task Environment 或 Development 判断是否需要 OpenSpec Change、生成 artifact 或取得其内容 authority。

完整 planning artifacts 形成后，读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider：创建或刷新同级 `brief.md`，执行 `assess`，并把真实 Brief/current knowledge/terminology impacts 写入 tasks 与 `.buildr/knowledge-impact.yml` evidence。没有真实内容的目标不得产生空文档任务；provider unresolved 或 dependency blocked 时将 Change 报告为 blocked，不得开始 apply。

写入或修订`tasks.md`的每个checkbox时，立即确认它能在Change convergence/archive前完成；只包含Change disposition前可完成的实现、当前认知、直接验证反馈与archive readiness动作，不为填写checklist预读完整下游流程。不得把Formal Development、Task Verification/Candidate、Task Finish、Environment cleanup、Task terminal state或其他只能在archive后发生的Task lifecycle动作写为Change checkbox，也不得把可选Task Review写成推进门禁。
