## Context

进程层所有权与交接现状：

- `storage` 锁是短暂锁（`claimStorage` 等待 5s），由启动写 pending、迁移与维护工作者短暂持有；运行中的 server 不长期持有。
- `owner` 锁由存活 server 持有；`/runtime` 接受已准备的目标 runtime 并置 `pendingRuntime`；定时器在 `canRunParallel && !inflight && !recovering && !sends.busy` 时触发 `adoptParallel`：旧 server 自行 launch 后继、释放 owner、retiring 保留至 drain。
- `connectAgentProcess` 的 `healthy()` 只核对持有身份，不比较客户端目标 digest，因此可携带目标 runtime 连接存活旧 owner；`lifecycle.activateRuntime` = `requestRuntime` + `awaitRuntime`。
- 现有 `activate-runtime.ts` 在 `agent_process_owned` 时回退 `stopAgentProcess(if-idle)`，忙时必败；从不调用 `activateRuntime`。

## Goals / Non-Goals

Goals：

- 旧 owner 存活且并行兼容时，激活经保留交接完成，不中断旧执行。
- 准备被短暂锁阻塞时有界重试；失败保留现场、可重试、诊断准确。

Non-Goals：

- 不改 `adoptParallel`/retiring/锁语义；不改 if-idle 探针；不强制不兼容版本升级。

## Decisions

1. **owned 回退重写**：`prepareAgentRuntime` 抛 `agent_process_owned` 时先尝试既有 stop-if-idle（空闲 owner 快速 drain，保持既有测试与语义）；若被 `agent_process_busy` 或探针超时（ABORT_ERR/AbortError）拒绝，证明 owner 忙或主线程 stall，则保留旧 owner，在 30s 预算内重试 prepare（storage 锁为短暂锁），成功后由 connect 的既有 `/runtime` + `requireRuntime` 交接完成采用。其他停止错误原样抛出。
2. **交接触发**：沿用 `connectAgentProcess` 既有交接（digest 不一致时发 `/runtime` 并 `awaitRuntime`），`activationTimeoutMs` 默认提升至 120s，覆盖 adoption 等待静默间隙与后继启动；不新增客户端交接调用。
3. **不兼容目标**：服务端 adoption 门禁不触发并行交接；`awaitRuntime` 在超时或 pending diagnostic 时抛既有错误，激活如实失败并保留旧执行；不自动 drain 忙 owner。
4. **探针不变**：交接路径不经过 if-idle `/status` 探针；ABORT_ERR 场景被新路径绕开。

## Risks / Trade-offs

- 活跃对话的连续操作使 `!inflight` 间隙变少 → adoption 延迟；以 120s 有界等待覆盖，超时保留旧 owner 并可重试，不丢工作。
- 重试 prepare 增加激活时长上限（30s）；仅在 owned 分支发生，冷启动不受影响。
- 旧回退 stop-if-idle 保留为最后手段，语义不变。

## Migration Plan

无存储/契约迁移；纯宿主装配行为变化，随主包发行。
