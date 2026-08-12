## Why

`task-triage` 已同时承担语义分流、执行环境、任务看板、OpenSpec 状态和验证规划，正文重复且部分协作仍依赖固定 Skill 名称；独立维护既有“当前事实”也缺少正式 capability operation。现在需要把任务分流收敛为可验证的正交决策，并让 current knowledge、task worktree 与 task board 通过最小能力契约稳定协作。

## What Changes

- 将 `task-triage` 重构为“事实核对 → 语义路径 → 执行形态 → 跟踪方式 → 下游交接”的三轴模型，压缩重复说明并输出完整 repository set、证据和阻塞原因。
- 明确独立当前事实收敛属于 `spec-maintenance + metadata-only`；事实变化仍进入 `change-flow`，authority 冲突时停止确认。
- 为 current knowledge capability 增加独立 `maintain` operation，并保留既有 Change 驱动的 `assess`、`reconcile`、`inspect`。
- 使任务看板以 task identity 为主，OpenSpec change 改为可选的 `0..N` 关联；复杂 code-only 任务不再为创建看板而伪造 change。
- 为 task-board 维护建立最小 capability contract；`task-triage` 通过 optional capability dependencies 解析 current knowledge、task worktree 和 task-board provider，在相关能力不可用时只阻塞对应分支。
- 保持 `task-verification` 为后续执行者：triage 只规划验证节点，不因验证 provider 暂时不可用而阻塞语义分流。
- 更新随包资产、Component contribution、静态验证和组合契约测试，验证各 runtime 的投射内容与能力图一致。

不包含破坏性 CLI 或数据迁移；现有 OpenSpec Change 生命周期 consumers 继续使用 `buildr.current-knowledge-maintenance/v1`。

## Capabilities

### New Capabilities

- `task-board-maintenance`: 定义任务看板 provider 的最小输入、授权、降级与结果证据，使 task-triage 不依赖固定 Skill identity。

### Modified Capabilities

- `agent-task-workflows`: 重构 task-triage 决策与输出契约，按 selected providers 交接任务环境、当前事实维护和任务看板。
- `current-knowledge-maintenance`: 增加不依附 OpenSpec Change 的当前事实 `maintain` operation 与结构化 evidence。
- `task-board`: 允许任务看板以稳定 task identity 独立存在，并将 OpenSpec changes 作为可选关联。

## Impact

- `skills/buildr/task-triage`、`current-knowledge-maintenance`、`task-board` 及其 runtime 投射。
- `skills/manifest.yml`、capability contracts、initial bindings 与 Buildr package baseline。
- OpenSpec Component 的 task-triage contribution 和完整性摘要。
- `agent-task-workflows`、`current-knowledge-maintenance`、`task-board` canonical specs，以及 current knowledge 流程说明。
- package static validation、capability graph、task-worktree routing、current knowledge 和 task-board contract tests。
