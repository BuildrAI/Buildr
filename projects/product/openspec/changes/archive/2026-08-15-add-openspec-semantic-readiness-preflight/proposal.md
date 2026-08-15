## Why

上游 `openspec validate --strict` 只能证明 Change artifact 结构合法，Scenario omission、Requirement/Scenario identity 歧义和 active Change 冲突仍可能直到最终 `converge` 才暴露，导致已经进入 Planning Review 或实现的方案被迫返工。现在需要把既有 deterministic convergence planner 的语义判断以前置、只读方式提供给 Agent，同时保留最终 `converge` 对最新事实的唯一写入与重新校验职责。

本变更不包含破坏性变更。

## What Changes

- 新增只读 `openspec convergence preflight`，复用正式 convergence planner、active Change conflict scan 与 projected strict validation，返回 `ready|blocked` 语义就绪结果。
- 将 blocker 明确区分为 active Change conflict、Scenario omission、Requirement/Scenario rename 或 identity conflict，并提供 Agent 可处理的最小诊断和下一步。
- 预检结果绑定当前 delta、canonical、active Change set 和 OpenSpec executable/algorithm identity；任一输入变化后旧结果失效，最终 `converge` 始终重新观察、规划和验证。
- OpenSpec Contract Guard 在 apply-ready 后、Planning Review 前运行预检；blocked 时由 Agent 修订 Change 语义或处理 active Change 依赖，Planning Review 本身不拥有、不复制也不解释检查逻辑。
- 预检不写 canonical spec、Convergence Receipt、archive、Task Review 或其他旁路状态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-deterministic-sync`: 为 deterministic planner 增加无写入的语义就绪观察与失效边界。
- `openspec-contract-guard`: 增加 Contract Guard preflight、稳定阻断分类和 Agent-readable 结果。
- `agent-task-workflows`: 在 Planning Review 前由 OpenSpec sidebar 消费 preflight，并把 blocked 语义决定交给 Agent。
- `cli-product-surface`: 注册 `openspec convergence preflight` 的公共命令、帮助与 JSON 契约。

## Impact

- 影响 Buildr OpenSpec Application、CLI command catalog、JSON contract registry、OpenSpec Contract Guard Skill contribution 与相关验证。
- 不新增外部依赖，不改变上游 OpenSpec CLI，也不改变 Planning Review Application。
- 最终 canonical 写入和 Change archive 仍只由 `buildr openspec converge` 执行。
