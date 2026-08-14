## Why

日常 Formal Task 已具备分阶段加载、验证计划预览和非门禁效率指标，但执行中仍会重复越过已知边界：Change checklist 夹带归档后生命周期动作、OpenSpec converge 误用 canonical Workspace、共享 helper 的旧兼容路径到正式验证才暴露，以及对 `--retry` 的重复说明。这些问题主要应由 Agent 的动作就近引导解决，Buildr 只补足可复用的确定性诊断和 Review evidence。

## What Changes

- 在 OpenSpec planning/apply guidance 中增加动作就近的 archive-before-completion 自检，并让 Planning Review 语义检查 checklist 边界；不使用关键词硬门禁。
- 将 `openspec converge --target` 明确为 Task Environment execution root，并在 active Change 不可见时返回区分 canonical Workspace 与 execution root 的诊断；不自动猜测 worktree。
- 为共享 validation/helper 改动增加调用面检查与一个最低成本既有兼容 canary 的 focused regression 指引，使正式 affected Verification 保持交付 authority、但不再承担首个明显回归发现点。
- 仅在 exact invocation 重执行决策点解释 `--retry`；Content Target 等 identity 输入变化时不重复播报“未传 retry”。
- 将同类窄任务的人工时间参考保留在 Retrospective 评估中，不进入 gate、Result、自动跳过或范围收缩；本次采用的 12–18 分钟只作为当前团队复盘标尺，不固化为通用产品阈值。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：补充 checklist 动作就近自检、`--retry` 沟通边界和非门禁时间参考的 Agent guidance。
- `openspec-deterministic-sync`：明确 converge target 的 execution-root 语义与错误诊断。
- `task-review-results`：让 Planning Review 对实际 Change checklist 执行语义边界审查并如实记录覆盖范围。
- `project-testing-guidance`：共享 helper 改动必须检查调用面并优先运行最低成本既有兼容 canary。

## Impact

- OpenSpec、Task Review、Project Testing、Task Verification 与 Task Retrospective 的 Buildr source Skills、OpenSpec Component definition及其 runtime 投射契约测试。
- Buildr CLI registry 和 OpenSpec converge 的 active Change 解析诊断。
- 对应 OpenSpec canonical specs、Brief/current knowledge impact evidence，以及 unit/integration/contract tests。
- 不修改 capability version、binding、数据库 schema、Verification Result authority或 Execution Record retry 语义；不需要 migration。
