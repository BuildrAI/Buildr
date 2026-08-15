## Why

Task Development 已约定 Change 收敛、current knowledge 与内容修改必须先于 stable Content Target，但 Application 仍允许在 Change 为 `pending` 时观察 Content Target，随后 Task Entry 甚至会推荐昂贵的 Formal Verification。这样 Candidate freeze 最终虽会阻止错误交付，正式验证却可能已经对白跑后又变化的目标执行过一次。

现在需要把既有顺序约束落实为动作就近、只读可见的 Formal Verification readiness，同时保持开发期 focused/affected 测试与通用 transient verification 完全不受影响。本变更不包含破坏性变更。

## What Changes

- Task Development `observe` 在关联 Change 仍为 `pending` 时 fail closed；code-only、Workspace-only、空 Change 与显式 `not-applicable` 场景继续正常工作。
- Task Development/Task Entry 增加 response-only 的 Formal Verification readiness 投影，区分 `not-applicable`、明确 `blocked` 与需要 current knowledge owner 即时确认的 `unknown`，不写入 Receipt 或新 store。
- 当 Change、Content Target 与 verification policy 的已知事实尚未稳定时，Task Entry 不再推荐 `task-verification`；已知事实稳定后先把一次只读 current knowledge `inspect` 作为 action-local preflight。
- current knowledge 返回 `aligned|not-applicable` 时，Agent 在同一当前 tree 上直接进入 Formal Verification；`unresolved` 时停止。该瞬时结论不持久化，也不让 Task Development 或 Verification 解释 knowledge 内容。
- 明确预检只适用于正式 Task 的 Development → Formal Verification 交接，不修改通用 `verification run`、Task 外 transient verification、开发期 focused/affected 测试或 Candidate CI。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 将 stable Content Target 的 Change disposition 前置条件落实到 `observe`，并提供只读 Formal Verification readiness/next action。
- `agent-task-workflows`: 在正式 Verification 前组合 Development 已知事实与 current knowledge owner 的瞬时检查，同时保持开发反馈与正式 gate 分离。

## Impact

- 影响 Task Development Application 的 `observe`/next 判定、compact result 与 Task Entry Snapshot JSON 投影，以及对应 contract、Skill 与测试。
- 不修改 Task Verification Application、`verification run` executor、Project verification declarations、测试选择器、Candidate CI 或持久数据库 schema。
- 与并行的 OpenSpec semantic readiness preflight 分工明确：该项负责 Planning Review 前的 Change 语义；本项只负责 stable Content Target 到 Formal Verification 的交接。
