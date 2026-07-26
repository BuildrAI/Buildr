## Buildr OpenSpec Sidebar

`openspec-update-change` 只修订既有 planning artifacts，不授予实现、同步或归档权限。若本次修订将进入代码修改、构建或测试，先重新执行 `task-worktree` 决策，创建或复用 canonical task environment，并用明确 target/workdir、repository membership 与 receipt-bound CLI 取得 `executionReady: true`；随后用 `openspec-apply-change` 进入实现。

仅更新计划时不重复报告 upstream 已解析的 status 或 `changeRoot`。计划修订不得绕过 verification、Buildr baseline/check 或 task-finish 的既有门禁。

若本次修订改变 scope、核心流程、影响、验收或 delta requirements，读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，刷新 `brief.md` 并重新执行 `assess`；tasks 与 `.buildr/knowledge-impact.yml` 必须反映修订后的真实影响。Provider unresolved 或 dependency blocked 时停止并报告，不得保留已知陈旧 Brief/evidence。
