## Why

Formal Task 的 authority 与 fail-closed 边界本身仍然必要，但当前 Agent 必须分别读取 Task、Environment、Development 与完整 capability binding，才能确定执行根、writer 和下一动作。已完成任务的权威时间线显示 Environment 实际准备不足 6 秒，而 Task 创建到首个 Development 事实用了 14 分 12.331 秒；本次任务在严格 action-local loading 下只用 1 分 03.368 秒，证明主要优化空间位于 Agent-facing 启动表面，而不是削弱生命周期 authority。

## What Changes

- 新增只读 `buildr task next <task-id> --json` 入口，返回 closed Task Entry Snapshot：Task、matching Environment、Development 的最小 identity/current facts、执行根、retained controller invocation、已知直接 blockers 与当前动作。
- 将下一动作区分为硬前置/恢复所需的 `required` 与可由用户或 Agent 调整的 `recommended`；入口不自动执行、不把建议变成 gate，也不枚举或接管完整研发 DAG。
- 从既有 Task Development next-action 判定同源投影 typed `next`，保留现有 `nextActions` 兼容字段，不复制第二套阶段判断。
- 只返回当前动作的 capability、contract、selected provider identity；完整 capability graph 继续只属于 Doctor full 与既有 runtime/receipt evidence。
- Environment 缺失时不读取 Review、Verification、Finish；Development 已存在时只消费保存的 compact applicability，完整 live currentness 继续由实际专业动作 owner fail closed。
- 提供 opt-in、response-only profile，记录本次入口 wall-clock 与 owner read 调用事实；不持久化 prompt、Context Window、隐藏推理或指标，不影响 Result、gate、Candidate、Task status 与自动推进。
- 更新 Buildr/task-triage/task-development 使用指引、CLI/reference、current knowledge、package/static parity 与 focused regression。
- 无破坏性变更；既有 Task inspect、Environment、Development driver、Review、Verification、Execution Record、Finish 与 Buildr Web Overview 保持兼容。

## Capabilities

### New Capabilities

- `task-entry-snapshot`: 定义组合既有 Task、Environment、Development owner 的只读入口快照、直接 blocker、执行路由、typed next 与无第二 authority 边界。

### Modified Capabilities

- `agent-task-workflows`: 正式 Task 创建/恢复后优先消费 Task Entry Snapshot，并保持 required 与 recommended 的用户调整边界。
- `public-json-contracts`: 登记 `buildr.task-entry-snapshot/v1` closed JSON 与 `buildr task next` 的公开 CLI 行为。
- `buildr-package-assets`: 将新 CLI、Application/projection、Skill guidance、schema 与测试纳入 package/runtime parity。

## Impact

- Product Application/CLI：Task Entry Snapshot 组合 projection、CLI registry 与公开 JSON schema。
- Task Development：现有 next-action 判定增加 typed 投影，旧 Result/driver 字段继续兼容。
- Task Environment/Task Record：只消费公开 read port，不改变 writer、Receipt 或数据库 schema。
- Buildr package/runtime：Task Triage、Task Development、产品入口 Skill、CLI reference、static validation 与相关 package assets。
- OpenSpec/current knowledge：新增 capability spec，并更新正式任务 workflow、public JSON、package parity 与 Buildr Service 当前事实。
- 数据：不新增表、migration、聚合 store、source-map history 或指标持久化。
