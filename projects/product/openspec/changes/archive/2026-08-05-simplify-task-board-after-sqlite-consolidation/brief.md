# SQLite 收敛后简化 Task Board

## 结论

当前静态 Task Board 没有 Parent/Child 与 Local App 无法覆盖的真实 consumer，应完整清退，不保留独立 Board Domain 或最薄 writer。

## 当前依据

- Task Record、Parent/Child、Development、Review、Verification current facts 已由 Workspace SQLite 和各专业 Application/read model 管理。
- Local App 与其他 consumer 不直接访问 SQL，能够从公开 read model 动态投影当前状态。
- `task-board` 的实际调用方只有 Task Triage 条件分支和 Agent 直接加载 Skill；没有 CLI、Application、Local App 或生产自动化 consumer。
- 静态 HTML 复制 `batches`、`dependencyPool`、进度、决策与证据，且现有页面已出现陈旧状态。
- Task Metadata Publication 已退出当前 package、capability graph、runtime、specs 与 tests，不能为 Board 恢复替代 publication。

## 交付边界

- 删除 Skill、contract、provider、binding、Triage 分支、template、专属 validation 与 tests。
- 保留通用 builtin replacement 机制；只删除无消费方的 `task-cockpit → task-board` 声明和 upgrade coverage。
- 两个历史 HTML 目录保持原路径和原内容。
- 不修改 SQLite schema、Task Record shape 或专业 authority。
- P1.1 只在真实协调缺口出现后另行探索。
