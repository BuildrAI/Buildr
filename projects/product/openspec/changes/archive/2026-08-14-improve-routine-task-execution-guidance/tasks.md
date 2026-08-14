## 1. 优化阶段化引导

- [x] 1.1 更新 `task-triage`，在当前决策和下一动作范围内按需读取 binding，并在事实充分时及时进入首个研发动作。
- [x] 1.2 更新 `task-development`，加入一次有界 authority source map、后续增量刷新及效率指标非门禁边界。
- [x] 1.3 更新 `task-verification`，优先消费 Project 已有 plan-only/dry-run 计划并明确 preview 不替代正式 evidence。

## 2. 固化契约与当前知识

- [x] 2.1 更新相关 contract tests，覆盖阶段化读取、source map、计划预览和指标非门禁语义。
- [x] 2.2 创建 Change Brief，并只更新受影响的 Buildr workflow/Service 当前知识与 knowledge impact evidence。

## 3. 窄范围验证

- [x] 3.1 运行 OpenSpec strict validation 与受影响 contract tests。
- [x] 3.2 使用 Buildr Product changed-test plan 核对正式验证范围，并确认 Change artifacts、实现和当前知识一致。
