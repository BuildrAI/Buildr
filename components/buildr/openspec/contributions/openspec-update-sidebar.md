## Buildr OpenSpec Sidebar

`openspec-update-change` 只修订既有 planning artifacts，不授予实现、同步或归档权限。若本次修订将进入代码修改、构建、测试或需要长期开发上下文，先重新执行 `task-worktree` 决策，创建或复用 canonical task environment；随后用 `openspec-apply-change` 进入实现。

仅更新计划时不重复报告 upstream 已解析的 status 或 `changeRoot`。计划修订不得绕过 verification、Buildr baseline/check 或 task-finish 的既有门禁。
