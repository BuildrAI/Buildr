## Why

复盘确认：开发期 `Task-affected` 反馈与后续 `Formal Verification` 仍可能沿两条独立路径重复执行；同时 `Task Development` 的 `observe/policy` 只有静态 schema/example，Agent 需要手工从 current facts 组装输入，容易在末段才发现约束错误。现在应收敛为少量、可恢复的工作流输入与复用边界，同时保持 Formal Verification 的独立 authority。

## What Changes

- 为 `Task Development` 提供基于 current Task、Environment、Change 与 declaration facts 的只读 `current-input discovery`，生成可直接用于 `observe/policy` 的 closed mutation input；发现过程不写 Receipt、不新增 authority。
- 明确 `Task-affected` 是 transient feedback，不能直接变成 Formal Verification Result；相同 `Verification Request` 的开发期 preview/反馈可被正式执行计划消费，避免重复启动同一验证工作，Formal Verification 仍只由正式 execution 写入 Result。
- 将公共 JSON/schema consumer coverage 固定为 focused regression 与诊断输入，不新增通用 hard gate，也不自动跳过正式验证。
- 保持现有 mutation input 与 Result schema 兼容；不新增数据库 authority、不改变 capability ownership。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 增加 current-input discovery 与其 fail-closed、无副作用边界。
- `task-verification`: 增加 transient feedback、formal execution 复用与 Result authority 的明确边界。
- `agent-task-workflows`: 更新 Development/Verification/consumer coverage 的最小执行指引。

## Impact

- 影响 `services/buildr` 的 Task Development operation contract、driver、Application 及 Verification planning/diagnostic 复用逻辑。
- 更新 workspace Skills 与对应 contract/integration/system tests。
- 仅新增响应式 CLI/workflow 能力；不需要数据迁移，不改变既有 `observe/policy` 输入字段，不改变正式 Verification Result 的写入 authority。
