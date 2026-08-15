## Why

formal Verification 在执行结束后、Execution Record seal 前异常退出，或 seal 本身失败时，原 record 会永久保持 `open`。相同 invocation 随后只会命中 active record，Agent 既不能补封存已完成结果，也不能在结果不可证明时安全解除阻塞，只能依赖 `--retry` 绕过原事实。

## What Changes

- 为 Verification open Execution Record 增加受控恢复：终态临时证据完整且与 record identity 一致时，由 Agent 补 seal 原 record。
- 当终态证据不可用时，只有携带明确用户授权才能把原 record 终结为 `unknown/attention`；保留结果未知的事实并解除相同 invocation 的 active 阻塞。
- 增加 Agent CLI `task execution-record recover` 及稳定、可移植 JSON 结果，明确区分自动恢复、需要授权和已授权未知处置。
- 通过连续 SQLite migration 扩展单一 `task_execution_records` authority；不新增状态表、heartbeat、后台调度或超时自动处置。
- 不自动重跑 Verification，不删除原 record，不根据超时或进程缺失伪造 `passed`、`failed`、`blocked` 或 `cancelled`。
- 不包含破坏性变更；旧 record 继续可读。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-execution-artifacts`: 增加 open Verification Execution Record 的证据恢复与未知终态处置规则。
- `cli-product-surface`: 增加 Agent 可调用的受控 recover 命令与授权边界。
- `public-json-contracts`: 增加 recover operation 的稳定公共 JSON 结果。

## Impact

- Domain/Application：Execution Record 终态、Verification 临时证据校验与恢复动作。
- Infrastructure：`task_execution_records` 连续 migration 与现有 CAS writer。
- CLI/JSON：`buildr task execution-record recover`、命令注册及公共 schema identity。
- Tests：Domain、Application、migration、CLI 与 Verification seal-failure 恢复覆盖。
