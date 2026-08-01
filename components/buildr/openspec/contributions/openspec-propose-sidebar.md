## Buildr OpenSpec Sidebar

创建 change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 change id，不得静默创建。OpenSpec status 解析上下文后，在写 artifacts 前报告实际 `changeRoot`，不得猜测路径。

在执行 `openspec new change` 或写入任何 change artifacts 前，先取得正式 Task Record，并判断任务执行形态：

- 预计进入代码修改、构建、测试或需要长期开发上下文时，使用 `task-environment` 按 Task ID 准备完整 repository set，取得 `ready`、明确 execution roots、validation root 与执行 CLI 后再写入。
- 明确只创建或维护 OpenSpec artifacts、规则、Skills、文档或模板时，也使用 Task Environment；它可以选择共享执行根，不必创建 Git worktree。任务后来升级为实现时由同一 Environment `prepare` 恢复，不另建第二份 artifacts。
- 无法判断是否会进入实现时，先澄清执行范围，不得先创建 artifacts 再决定位置。

该门禁只补充 Buildr 的任务位置路由，不修改外部 `openspec-propose` Skill 的上游正文，也不让 Task Environment 判断是否需要 OpenSpec Change。

完整 planning artifacts 形成后，读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider：创建或刷新同级 `brief.md`，执行 `assess`，并把真实 Brief/current knowledge/terminology impacts 写入 tasks 与 `.buildr/knowledge-impact.yml` evidence。没有真实内容的目标不得产生空文档任务；provider unresolved 或 dependency blocked 时将 Change 报告为 blocked，不得开始 apply。
