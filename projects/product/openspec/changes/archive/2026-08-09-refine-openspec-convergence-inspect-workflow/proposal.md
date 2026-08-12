## Why

当前 `OpenSpec Audit` 同时被理解为事务恢复检查和归档后的长期审计，导致 Convergence Receipt 被错误提升为需要随交付永久保留的第二份证明。正常 `converge` 已经完成写后确认与归档；继续要求 Worktree 清理后读取 Receipt，既重复终态 authority，也与 Task 交付排除 `.buildr` 控制材料的边界冲突。

## What Changes

- 将公开只读能力统一命名为 OpenSpec Convergence Inspect（OpenSpec 收敛检查），只用于当前收敛事务中断或状态不确定时的文件事实诊断。
- **BREAKING**：用 `buildr openspec convergence inspect` 替代 `buildr openspec audit`，并将公共 JSON schema 从 `buildr.openspec-convergence-audit/v1` 替换为 `buildr.openspec-convergence-inspect/v1`。
- 明确 Convergence Receipt 是事务期恢复材料：事务未开始或已经成功归档且 Receipt 已释放时，Inspect 返回 `not-applicable`，不得报告 `recovery-unprovable`。
- 正常 `converge` 成功后直接消费 `passed + archived`；Formal Task Finish 和 Environment cleanup 不运行 Inspect，也不要求清理后保留或读取 Receipt。
- 让归档后的 OpenSpec Change、Canonical Specs、Git 交付事实和 Formal Finish Result 承担正常长期事实；产品候选检查不再要求 tracked active/archive Receipt。
- 保留 `recovery-unprovable` 只处理存在 Receipt 但文件为 mixed/unknown、Receipt 无效或其他真实恢复证据冲突的情况。
- 不新增数据库、history/event/audit store、第二份 Result 或 lifecycle authority。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-deterministic-sync`: 收窄 Receipt 生命周期、定义 Convergence Inspect 的适用阶段与终态释放语义。
- `cli-product-surface`: 统一公开命令和 JSON schema 名称，移除 `openspec audit` 当前入口。
- `agent-task-workflows`: 约束 Agent 仅在未完成收敛的异常恢复阶段使用 Inspect，禁止清理后追索 Receipt。
- `buildr-package-assets`: 让产品候选与 package 验证依赖归档 Change 和 canonical 契约事实，而不是 tracked convergence Receipt。

## Impact

- OpenSpec convergence Application、CLI command catalog、公共 JSON registry 和帮助文本。
- OpenSpec Contract Guard Skill、OpenSpec workflow contributions、current knowledge、术语和产品/Service 文档。
- OpenSpec transaction/recovery、CLI compatibility、public JSON、candidate contract audit、package/static/System 测试。
- 不改变 SQLite schema、Task Record、Task Development、Task Finish Result 或 Task Environment authority。
