## Why

Buildr 当前把 `product.candidate` 对所有 Product 路径设为交付必需，导致文档或局部实现等影响面明确的任务也要重复运行约 350 秒的 44 项全量验证；Candidate 内部还混入 Browser smoke 和 Release 专项。首轮方案又把 Task-affected 与条件化 Candidate 设计成两个可能重叠的 required capability，实际仍是在同一任务影响面上重复选择范围。需要先修正编排模型，再收敛正式交付和全量回归入口。

## What Changes

- 将 Quick、affected/full 与 Candidate/Release 分别定义为成本约束、选择范围和验证目标/节点，不再作为同一层级的互斥“编排场景”。
- 建立唯一 required `product.delivery` capability：始终针对冻结目标运行 changed planner；普通路径选择 affected 证据，验证 registry/planner/runner 等全局 owner 变化时由同一 plan 扩展为 full。
- 把完整回归保留为显式、非默认的 `product.full-regression` capability，并保持 `npm run test:candidate` 兼容入口；不得与 `product.delivery` 形成双 required writer/runner。
- 逐项审计 Candidate step 的唯一证明事实；保留必要主证据，把 Browser smoke、Release workflow 等专项迁出默认 Candidate，并删除已被更强主证据完整覆盖且没有独立失败模式的测试。
- 保持 Task Verification v2 declaration、v3 current Result、Finish path applicability、Project registry 和 Release 的现有 authority，不引入风险评分、Candidate generation、Result 字段或通用测试平台。
- 更新 Buildr 测试实践、Project 规则、release checklist 与相关 current knowledge，记录新的编排边界和实测耗时。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-testing-guidance`: 将成本约束、范围选择与验证目标/节点拆开判断；Candidate 本身不再等同 full，正式任务在冻结 Candidate 上可以执行 affected 或 full。
- `cli-modular-architecture`: 由单一 changed plan 同时承担 affected 与必要的 full 扩展，保留显式完整回归入口，并删除 registry 中重复的“编排场景”分类 authority。

## Impact

- Product policy：`projects/product/verification.yml`、`projects/product/AGENTS.md`。
- Product tests：Buildr verification registry、planner、entrypoint contract 与相关 System/Release tests。
- Agent guidance：`project-testing` / `task-verification` 的声明与选择说明。
- 文档和 current knowledge：验证实践、release checklist、Buildr Service knowledge。
- 兼容性：保留 `test:changed`、`test:candidate`、非 Browser step id 与 focus/group selector；Project capability id 从含混的 `product.candidate` 收敛为 `product.delivery` 与 `product.full-regression`，五个 Browser step id 由现有 `test:browser:<selector>` 诊断入口替代。
