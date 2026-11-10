## Why

自动标题在早期与完成兜底两个有界阶段都失败后，对话标题仍停留在“新对话”，用户只能从生成状态说明里判断失败，容易误以为标题尚未开始。用户已有独立的修改标题入口，也不希望系统继续重试；现在需要把最终失败直接表达在标题上，让用户无需额外查看来龙去脉就知道该手动改名。

## What Changes

- 自动标题全部有界尝试失败、标题仍为中性名称时，把标题回填为明确的失败提醒「生成标题错误，请手动修改」，并保留现有的失败状态与原因说明。
- 不新增自动重试，不改变早期/完成两阶段的预算、参与者隔离和重启后不重复消耗尝试的约束。
- 手动改名、已生成标题、显式手动生成失败仍优先且不被提醒标题覆盖。

**BREAKING**: 无。前端修改标题入口与既有手动改名行为不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 调整自动标题最终失败时的名称表现，从“保留中性名称”改为“回填明确的失败提醒标题”，并保持失败不阻塞对话与手动改名优先。

## Impact

- `projects/product/services/buildr-agent/src/application/conversation-application.ts`：自动标题完成阶段失败后的标题回填、提醒标题的再次尝试资格，以及启动时对历史失败对话的一次性修复。
- `projects/product/services/buildr-agent/src/persistence/conversation-repository.ts`：按失败状态筛选历史候选对话的只读查询。
- `projects/product/services/buildr-agent/test/`：新增或调整标题失败处理的单元/集成测试。
- `projects/product/openspec/specs/agent-conversations/spec.md`：对应增量规范。
