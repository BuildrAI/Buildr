## Why

`buildr task finish run|inspect` 已公开 `--detail compact|full`，但当前 Application 忽略该参数，两个模式都输出完整 `buildr.task-finish-result/v2`。这使 Agent 在只需判断状态和恢复动作时仍需消费数百行内部阶段事实，并让公开 CLI 声明与实际行为不一致。

## What Changes

- 为 Task Finish JSON 增加 closed compact 投影，只保留状态、关键 identity、当前阶段、主失败、唯一下一动作、恢复事实、关键 Git refs、耗时与 Execution Record 摘要。
- `--detail full` 保持现有 `buildr.task-finish-result/v2` 完整诊断输出；显式 compact 使用独立 public JSON identity，避免把删字段伪装为 v2 兼容扩展。
- 明确并校验 `--detail` 只接受 `compact|full`，缺省 JSON 输出采用 compact；非 JSON 文本输出保持现状。
- 为 complete、blocked、resume 与 Delivery Adaptation 等典型结果增加 public schema、CLI 和 checkout/package parity 保护。
- 不改变 Task Finish run、SQLite authority、固定五阶段、resume token、Execution Record 或 self-bootstrap 行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-json-contracts`：定义 Task Finish compact/full 两种 JSON 投影、schema identity、默认值和兼容边界。
- `task-finish-execution`：规定 compact 投影必须保留完成判断与恢复所需的最小 Finish owner facts，不取得新的执行或持久化 authority。

## Impact

- `buildr` Service 的 Task Finish CLI 参数校验、Application 输出边界、public JSON schema registry、帮助与文档。
- Task Finish unit/integration/system、JSON contract coverage 和 checkout/npm parity 测试。
- 依赖完整 v2 结果的内部 self-bootstrap runner 已显式使用 `--detail full`，继续消费原输出；普通 Agent 默认获得 compact 输出。
