## Context

任务看板是 Project task-scoped working knowledge，生命周期可以跨越多个 Change、交付批次和 Agent session。task environment 是实现候选的隔离载体，可以被归档、集成和清理。当前路径格式稳定，但“Project 所在环境”没有区分 retained Workspace checkout 与临时 task environment。

## Goals / Non-Goals

**Goals:**

- 让一个 Project task 只有一份由 retained Workspace checkout 持有的任务看板。
- 允许 Agent 从主 Workspace session 或任一关联 task environment 核实事实，但始终把看板写回 retained checkout。
- 用契约和测试防止未来重新引入 environment-local 看板。

**Non-Goals:**

- 不让 task-board 自动创建、采用或清理 task environment。
- 不迁移既有 `task-boards/` 或 `task-cockpits/` 页面。
- 不改变 Change、代码或验证 evidence 在 task environment 中维护的规则。

## Decisions

### 1. Retained Workspace 是看板唯一写入 authority

provider 从显式 Workspace identity 或 task environment receipt 解析 canonical Workspace root，再在 retained checkout 的 `projects/<project>/openspec/knowledge/task-boards/` 定位看板。不能把调用 cwd、environment root 或 environment 内 Project 副本作为写入 authority。

相比让每个 Change environment 携带看板，这一选择避免多份任务真相、环境清理导致入口消失以及并行 Change 合并冲突。相比单独建立 Workspace 外数据库，它继续保持现有 Git 可审计的 Project knowledge 模型。

### 2. Task environment 只贡献来源事实

关联 environment 中的 OpenSpec artifacts、代码、提交和验证结果可以列入 `sourceIdentities`，但 provider 不在其中创建、复制或更新 HTML。调用发生在 environment 内时，仍需显式核对其 Workspace ownership，避免写入其他 Workspace。

### 3. 写入主 checkout 不等于绕过冲突保护

retained checkout 中目标文件存在未确认修改、identity 冲突、Project 无法解析或写入授权不完整时返回 `blocked`。本次只强化位置选择，不引入自动 merge、stash 或覆盖行为。

## Risks / Trade-offs

- [并行任务可能同时更新 retained checkout] → 保持单文件 identity、候选验证和冲突即 blocked；不让 environment 副本成为隐式合并机制。
- [实现任务的 Git 候选不自动包含看板更新] → 这是刻意的所有权分离；看板是跨 Change 跟踪资产，由 Agent 在 retained checkout 单独维护和核实。
- [旧文案可能仍被历史 runtime 使用] → 更新 source 后通过 Buildr sync 投射所有受管 package/runtime 资产并执行 doctor。

## Migration Plan

1. 更新 canonical specs、capability contract 和 task-board Skill。
2. 增加静态 contract test，要求 retained Workspace 边界和禁止 environment-local 写入。
3. 用 Buildr sync 更新 package/runtime 投射并执行验证。
4. 不扫描或迁移现有 HTML；现有稳定路径保持不变。

## Open Questions

无。
