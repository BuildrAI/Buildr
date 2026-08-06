## Why

Local App 的 development、reviews、verification 只读请求已经拆开了事实读取，但这些 Application 仍在 HTTP 进程内同步执行 `DatabaseSync` 读取；并发打开多个 Tab 时，单个较慢读取会阻塞 Node event loop，并让后续请求无界累积。现在需要把这条读取路径的阻塞工作纳入明确、可测的容量边界，避免以“async handler”名义掩盖同步阻塞。

## What Changes

- 为 Local App 与共享只读 Application 引入固定容量的只读 executor，统一承载可能阻塞的 Structured Store read operation。
- executor 使用有界并发和明确排队/拒绝、错误传播及取消语义；不按请求创建 Worker，不建立第二个 Task/Result/Structured Store authority。
- development、reviews、verification 三个 Tab 继续分别读取自身节点记录和已写交付关联，并通过受控 executor 执行，不恢复对完整 terminal 聚合投影的依赖。
- 增加调用次数、并发上限、排队延迟、取消、失败传播和跨 Tab 读取隔离的回归证据。
- 保留已解析 canonical root 的只读路径无 Git/worktree provenance 与 `git rev-parse`；保留写入、migration、Environment、worktree、Finish、Doctor 的必要 Git 校验。

## Capabilities

### New Capabilities

- `bounded-local-app-read-execution`: 为 Local App 只读 Application 提供固定容量、可取消、错误可传播的阻塞读取执行边界。

### Modified Capabilities

无。现有 Local App Task read model 与三个 Tab 的事实边界已经由前序 Change 收敛；本 Change 新增其执行容量与非阻塞约束。

## Impact

- 影响 `services/buildr/src/interfaces/local-app/http` 的请求调度、共享只读 executor，以及 Task Development/Review/Verification read view 的调用边界。
- 影响 `DatabaseSync` 读取的生命周期与测试注入点，可能涉及受控 Worker 或等价异步执行机制；不改变 SQLite schema、Task current record authority 或 writer provenance。
- 增加 Local App system/integration 测试及必要的 contract 约束，验证并发容量、响应延迟、取消和错误行为。
