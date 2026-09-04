## ADDED Requirements

### Requirement: 自举任务验证必须在调用前分离执行 runtime 与 canonical writer
Task Verification consumer MUST 允许 Agent 在 Task worktree 执行项目测试并形成 portable report，但在 Buildr 自举 Workspace 中调用 `task verification inspect|record` 前 MUST 选择 canonical retained Buildr writer。Candidate runtime MUST NOT 首次尝试写 retained Workspace，也 MUST NOT 自动转发、伪造或取得 canonical writer authority。

#### Scenario: Task worktree 完成测试并登记报告
- **WHEN** Agent 在 linked Task worktree 完成检查并准备向 canonical Workspace 保存 current Verification Report
- **THEN** Agent MUST 使用 `<canonical-workspace>/projects/product/buildr` 执行 `inspect` 与 `record`
- **AND** 两个动作 MUST 指向同一 canonical Workspace、使用同一 retained writer invocation，并携带最近一次 inspect 的 report digest

#### Scenario: candidate writer 被直接调用
- **WHEN** candidate Buildr runtime 被直接要求向共享 Git common directory 的 retained Workspace 写报告
- **THEN** writer provenance guard MUST 在 SQLite、WAL、ledger 或报告 mutation 前拒绝调用
- **AND** 诊断 MUST 指向 retained Buildr entry，且 MUST NOT 自动重试或重新执行项目测试
