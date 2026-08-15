# 恢复失联的 Task Execution Record

## 摘要

让 Agent 在 formal Verification 已结束但 Execution Record 未 seal 时补回原终态；无法证明原结果时，仅凭用户明确授权保存 `unknown` 并解除 invocation 阻塞。

## 背景与问题

Verification 先 open record、后执行 capability、最后 seal。seal 失败或进程异常退出会留下永久 open record，相同 invocation 默认只返回 active，既不能恢复已完成结果，也不能在结果未知时安全继续。

## 目标与非目标

- 目标：复用完整 transient terminal evidence 补 seal；无证据时要求 unknown outcome 授权；保留单一 SQLite/body authority。
- 非目标：不增加 heartbeat、后台 scheduler、自动 timeout、进程监控、第二状态表或自动 retry；不采用 Verification Result。

## 受影响角色

- Agent：默认检查并执行可证明恢复，证据不足时向用户说明精确影响并请求授权。
- 用户：只决定是否接受原 Verification 结果未知以及终结原 record 的并发影响。

## 核心流程

1. Agent inspect open Verification record，并取得原 invocation 返回的 transient summary。
2. summary 完整且 identity/outcome 一致时，Buildr seal 原 record并清理 owned transient。
3. summary 不可用时，Buildr 零写入返回 authorization-required。
4. 用户授权后，Buildr 以 `unknown` 终结原 record；后续普通 Verification 创建新 run，原 record继续可读。

## 关键变化

- 新增 `task execution-record recover`。
- Execution Record 增加 `unknown` terminal outcome。
- unknown record 不参与 terminal duplicate reuse，但按失败类固定 retention 保留。

## 影响、风险与兼容性

- 连续 migration 只扩展现有单表 CHECK，旧 rows 与读取语义保持。
- 用户过早授权 unknown 可能使仍存活 producer 的后续 seal 失败；CAS 防止覆盖，CLI 必须显式说明。
- unknown 不表示通过或失败，不能作为 Verification Result。

## 验收摘要

- 完整终态证据可以补 seal 且不重跑。
- 缺证据且无授权零 mutation。
- 授权后 record 为 unknown，原 invocation 不再阻塞新 run。
- 无后台、超时、第二 store 或任意路径/结果输入。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-execution-artifacts/spec.md`
- `specs/cli-product-surface/spec.md`
- `specs/public-json-contracts/spec.md`
- `tasks.md`
