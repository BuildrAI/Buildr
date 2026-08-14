## Why

日常正式任务当前虽有完整的 authority 与生命周期边界，但引导容易让 Agent 在当前阶段过早读取下游 Skills、重复建立事实图或凭经验叠加验证，造成 proposal 启动和实现交接变慢。现在需要把效率优化落实为可复用引导，同时明确 Buildr 不接管 Agent 的专业判断，耗时指标也不成为新的门禁。

## What Changes

- 为 `task-triage`、`task-development` 与 `task-verification` 增加阶段化、按需读取引导：只在当前动作前读取 required contract/provider，下游阶段到达时再加载。
- 要求在 facts 足够且用户已授权后及时进入正式 Task、Environment、Development 与 proposal，并在修改前建立一次有界 authority source map，后续按变化增量刷新。
- 引导 Agent 在正式验证前优先使用 Project 已提供的 plan-only/dry-run 入口判断 affected 范围；计划预览不是验证 evidence，也不替代正式 capability execution。
- 明确效率指标仅用于 retrospective 中的跟踪、评估和优化，不得改变 Result、gate、Task 状态或绕过 required action。
- 更新内置 Skill 契约测试和当前知识，使上述边界可持续检查。
- 不改变现有 capability contract identity、Application schema、repository authority、CLI 或正式验证结论语义；不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 增加日常正式任务的阶段化上下文装配、单次 source map、验证计划预览与非门禁效率指标引导。

## Impact

- 受影响：Buildr package 中的 `task-triage`、`task-development`、`task-verification` Skill 源，相关契约测试，以及 Buildr 当前知识。
- 不受影响：`buildr.task-development@2`、`buildr.task-verification@3` contract identity，Task/Environment/Review/Verification/Finish Application 与 repository，Project verification declaration 和历史 Result/Execution Record。
