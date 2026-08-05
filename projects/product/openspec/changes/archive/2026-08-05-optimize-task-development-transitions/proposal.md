## Why

Task Development 的单次内部 transition 会多次独立解析同一个 canonical Workspace、重复读取 Task Record 并重复打开 Workspace SQLite。现有复盘把工具调用总耗时误判为 runtime composition 冷启动；需要先让产品返回可归因的阶段计时，再消除已验证的重复读取，避免基于错误瓶颈引入 daemon 或第二写入者。

## What Changes

- 为 Task Development 内部 driver 的每次 operation 返回进程内阶段计时，区分 module/runtime setup、Application execution 与 serialization，不把 Agent 工具调度时间冒充产品耗时。
- 在单次 Task Development Application operation 内复用已验证的 canonical Workspace context、Task Record read model 与只读 Workspace Structured Store session，减少重复 Git checkout observation、migration 校验和 SQLite open/close。
- 保持每个 driver invocation 独立进程、唯一 Development Receipt、Workspace SQLite 单一写入者、现有 transaction 与 fail-closed 行为；不引入 daemon、跨进程缓存、第二 repository 或新状态平台。
- 增加性能回归测试，证明结果语义不变，并对重复 canonical/store observation 设置结构性上限；耗时只作为 evidence，不使用脆弱的绝对时限判定功能失败。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 补充单次 operation 的可归因计时 evidence，以及 operation-scoped 只读 context/store 复用边界。

## Impact

- 源码：`services/buildr/src/interfaces/internal/task-development-driver.mjs`、Task Development Application 与 Workspace SQLite/Task repositories 的窄组合边界。
- 测试：Task Development integration/contract tests，并增加稳定的调用次数与计时 shape 断言。
- 兼容性：不增加公共 CLI，不改变 Receipt、Candidate、Result、decision 或 handoff schema；内部 driver JSON 只追加 response-only timing evidence。
