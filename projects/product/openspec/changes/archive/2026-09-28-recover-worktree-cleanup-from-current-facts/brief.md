# 依据当前事实接续工作树清理

接手工作的智能体（Agent）可以明确提供已有工作树（Worktree）的当前对象，让 Buildr 重新核验并清理；不再因缺少历史登记而留下无法处理的资源。未保存内容、错误对象、占用和交付保全检查继续有效。

本次维护实现、命令参考和 `task-worktree`、`task-triage`、`task-finish` 的协作说明，并校准 `knowledge/docs/architecture/task-system.md` 的资源接续解释。在 `knowledge/code-map/task-system.md` 及阅读索引补充当前对象核验文件；现有技术图的职责关系不变，无需重画；沿用已有术语，不引入新的长期概念。

验收重点是：无登记可明确接续、冲突不能绕过、部分删除可恢复、无事实依据不报告清理完成。来源为 `task-environments` 规范、Git 工作树（Worktree）提供者（Provider）实现及真实 Git 场景测试。
