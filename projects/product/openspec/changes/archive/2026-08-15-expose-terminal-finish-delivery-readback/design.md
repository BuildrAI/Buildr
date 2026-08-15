## Context

Buildr 已通过 `inspectTaskTerminalDelivery(targetRoot, taskId)` 组合 Task Record、Task Development、Task Review、Task Verification 与 Task Finish current/terminal facts，并产出 `buildr.task-terminal-delivery/v1`。Local App 已消费该模型，但 CLI 尚无按 Task ID 的直接入口；现有 `task finish inspect` 必须先持有 run ID。

本变更只增加 CLI adapter 与产品表面声明。SQLite owner、Application 组合逻辑、Finish run 明细查询以及 Task Record 查询均保持不变。

## Goals / Non-Goals

**Goals:**

- 允许 Agent 仅凭 Task ID 回读当前 Terminal Delivery 状态。
- 稳定返回 delivered 状态下的 Finish run ID、final remote ref 与 cleanup 摘要，以及 current run 下的 phase 和恢复动作。
- 让命令、help、JSON registry、文档和测试使用同一公开产品表面。
- 保持查询严格只读，不产生 Task、Finish、Environment 或 Git 副作用。

**Non-Goals:**

- 不替代 `task finish inspect --run` 的完整 run 明细查询。
- 不扩展 `task inspect` 的 Task Record 结果。
- 不增加 Finish 历史枚举、stdout 保存、恢复执行或自动处置。
- 不增加数据库表、投影 writer、迁移或 Local App 行为。

## Decisions

### 1. 使用独立的 `task delivery inspect` 命令

命令采用 `buildr task delivery inspect <task-id> [--target ...] [--json]`，并登记为 `agent-machine` surface。

选择独立命令，是因为 `task inspect` 由 Task Record Application 独占，`task finish inspect` 则按 run identity 查询完整 Finish Result。把按 Task 组合查询塞入任一现有入口都会混淆 owner 和兼容边界。

曾考虑新增 `task finish inspect --task`，但这会让同一 action 同时承担“按 run 查明细”和“按 Task 查 current/terminal projection”两种 identity，增加参数互斥与恢复语义歧义，因此不采用。

### 2. CLI 直接调用现有 Terminal Delivery Application

CLI adapter 只解析一个 Task ID、`--target` 和 `--json`，随后调用 `runtime.inspectTaskTerminalDelivery(targetRoot, taskId)`。不在 interface 层重新组合 Task/Finish/Development 数据，也不读取 SQLite internals。

这保证 Local App 与 CLI 使用同一状态判断、association 校验、cleanup 摘要与恢复动作。Application 的现有输出无需为 CLI 建立第二投影。

### 3. 将既有 schema 注册为公开 JSON family

JSON 输出直接使用 `buildr.task-terminal-delivery/v1`，并将该 identity 纳入 `PUBLIC_JSON_SCHEMAS`。CLI 不包裹新的 operation result schema，从而避免同一 read model 出现两种近似结构。

文本输出只提供紧凑摘要：状态、run ID，以及 delivered 时的 final ref/cleanup 或 current 时的 phase/next action。自动化恢复应使用 `--json`。

### 4. 缺失或无可证明交付时保持现有只读状态

命令不把“尚无 Finish run”视为写入机会。active Task 没有 run 时返回既有 `active` projection；已完成但 association 不可证明时返回 `completed-unproven` 与既有 diagnostic；不存在的 Task 继续由 Task Record owner 的 canonical error 决定。

## Risks / Trade-offs

- [公开 schema 后消费者开始依赖完整 projection] → 文档明确稳定用途为 terminal delivery 回读，同时由现有 Application 单一生成结构并增加 CLI 契约测试。
- [命令名称与 Task Record action 被误解为同一层级] → 使用三段式 `task delivery inspect` 并在 help 中明确它是组合型只读 agent-machine 入口。
- [并行任务同时修改 registry、文档或 JSON schema 清单] → 变更保持局部新增，集成时按 command metadata authority 合并并运行产品表面验证。

## Migration Plan

无需数据迁移。发布后旧调用保持不变，新调用可直接按 Task ID 查询。回滚只需移除新增 route、adapter、schema registry entry、文档与测试，不影响既有 SQLite 或 Finish facts。

## Open Questions

无。
