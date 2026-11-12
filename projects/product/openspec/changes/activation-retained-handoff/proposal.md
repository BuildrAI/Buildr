## Why

自举激活（`activateAgentServiceRuntime`）在旧执行服务存活时无法完成：`prepareAgentRuntime` 需要短暂 storage 锁，被维护工作者短暂持有时 5s 等待到期返回 `agent_process_owned`；现有回退走 `stopAgentProcess(if-idle)`，该路径只 drain 证明空闲的代际，活跃执行必然失败，且 if-idle 的 `/status` 探针 3s 硬超时在主线程秒级 stall 时返回 `ABORT_ERR`。进程层已具备“旧执行保留、启动新执行器”的交接机制（`/runtime` → `pendingRuntime` → `adoptParallel`，旧代际 retiring 保留至 drain），但激活路径从未调用 `lifecycle.activateRuntime`，能力孤儿导致忙时激活必败。

## What Changes

- 激活路径在 `agent_process_owned` 且存在存活 owner 时，有界重试准备目标 runtime（storage 锁为短暂锁），连接存活旧 owner 并经 `lifecycle.activateRuntime` 触发保留交接，等待后继成为 owner 后验证。
- 无存活 owner（陈旧锁/冷启动）时沿用既有冷启动路径；并行不兼容时由服务端既有 adoption 门禁拒绝并保留旧执行，激活如实报告可重试失败。
- 不改变 `adoptParallel`、retiring、存储锁与 if-idle 探针语义；不中断旧执行。
- 新增 handoff 集成用例：忙 owner 保留交接成功、不兼容目标保留旧执行。

## Capabilities

### New Capabilities

- `agent-runtime-activation`: 智能体执行服务激活在旧 owner 存活时的保留交接、有界准备与失败保留语义。

### Modified Capabilities

（无；进程层既有契约不变。）

## Impact

- `services/buildr/src/modules/agent-service/application/activate-runtime.ts`（宿主激活装配）。
- `services/buildr-agent/test/integration/process/handoff/` 新增用例。
- 依赖既有公开 API：`connectAgentProcess`、`prepareAgentRuntime`、`lifecycle.activateRuntime` 与进程记录观察入口。
