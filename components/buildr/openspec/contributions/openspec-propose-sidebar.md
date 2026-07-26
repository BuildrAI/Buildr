## Buildr OpenSpec Sidebar

创建 change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 change id，不得静默创建。OpenSpec status 解析上下文后，在写 artifacts 前报告实际 `changeRoot`，不得猜测路径。

在执行 `openspec new change` 或写入任何 change artifacts 前，先判断任务执行形态：

- 预计进入代码修改、构建、测试或需要长期开发上下文时，必须先使用 `task-worktree` 声明完整 repository set，创建或复用 canonical task environment；随后完成 Agent session handoff/adopt，并用携带同一 host-visible session root/handle 的 `worktree context` 确认 `executionReady: true`、实际 cwd 属于 allowed execution roots 后再继续 propose。只改变工具 cwd 或 runtime 文件存在不得视为 adopted。
- 明确只创建或维护 OpenSpec artifacts、规则、Skills、文档或模板，且不会进入代码、构建或测试时，可以在当前 workspace propose；任务后来升级为实现时必须重新执行 worktree 决策并收敛到唯一副本。
- 无法判断是否会进入实现时，先澄清执行范围，不得先创建 artifacts 再决定位置。

该门禁只补充 Buildr 的任务位置路由，不修改外部 `openspec-propose` Skill 的上游正文，也不让 `task-worktree` 判断是否需要 OpenSpec change。

完整 planning artifacts 形成后，读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider：创建或刷新同级 `brief.md`，执行 `assess`，并把真实 Brief/current knowledge/terminology impacts 写入 tasks 与 `.buildr/knowledge-impact.yml` evidence。没有真实内容的目标不得产生空文档任务；provider unresolved 或 dependency blocked 时将 Change 报告为 blocked，不得开始 apply。
