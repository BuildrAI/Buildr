## Why

正式 Task 已完成交付并清理 Environment 后，Local App 仍只能按实时目标可观察性把研发、审查和验证证据显示为未知，掩盖了已经由 Formal Task Finish 证明的交付事实。现在需要在不改变任何既有 writer 或持久化 authority 的前提下，为 terminal Task 增加可核验的只读交付投影。

## What Changes

- 在 Application 层组合 SQLite 中的 Task、Development、Review、Verification current records 与文件仓中的 Formal Finish Result，派生 terminal Task 的 `delivered|completed-no-change|completed-unproven|abandoned|unavailable` 状态。
- 为 Finish Result repository/Application 增加最窄的按 Task 只读查询，只选择身份匹配的成功 completed Result；旧失败或不匹配结果仅作诊断。
- 保持 active Task 的 `current|stale|unknown|missing` 实时语义不变；terminal 投影明确表达“交付时事实”，不把历史 Candidate 或 Result 重新标记为 current。
- 调整 Local App 研发页与证据页的信息层级和中文文案，优先展示交付结论、完成时间、远端 ref 与 cleanup，并把 digest、SHA 和 locator 下沉为技术详情。
- 扩展 Application、Local App HTTP/Web 与 Browser Smoke 自动化覆盖 completed delivered、noChange、unproven、identity mismatch、多 Finish run、planning gate、abandoned，以及 active ready/unknown/stale 回归。
- 不包含破坏性变更；不新增 writer、SQLite 表、聚合 store、缓存或 lifecycle authority，Finish Result 继续保存在现有 JSON repository。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 增加 terminal Task 的交付时只读投影，同时保持 active 实时 currentness 语义。
- `task-review-results`: 增加依据 immutable handoff 与成功 Finish 证明的交付时 Review 采用关系。
- `task-verification`: 增加依据 immutable handoff 与成功 Finish 证明的交付时 Verification 关联。
- `task-finish-execution`: 增加按 Task 安全读取成功 completed Finish Result 与严格身份匹配要求。
- `local-workspace-application`: 调整 Local App terminal Task 研发与证据视图、API 组合边界和信息层级。
- `local-app-browser-verification`: 扩展 terminal delivery 与 active currentness 的 Browser Smoke 场景。

## Impact

- Product Application/read model：Task Development、Task Finish，以及一个窄 terminal Task delivery composer。
- Local App：Task detail HTTP routes、Web presenter/style，不新增一级页签或写接口。
- 测试：Application/integration/contract、Local App HTTP/Web、Browser Smoke fixture 与 assertions。
- OpenSpec：上述六个 current capability 的 delta specs；Finish Result 文件位置与 SQLite schema 均保持不变。
