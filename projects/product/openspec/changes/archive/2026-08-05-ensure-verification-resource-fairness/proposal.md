## Why

多个正式验证同时等待同一 coordinated resource 时，当前轮询抢占没有等待顺序，新运行可以持续越过老 waiter。本次实测因此让一个已等待的 Full 在 600 秒后超时；需要在保留容量、lease 与 ownership 边界的同时消除饥饿。

## What Changes

- 为 coordinated resource 增加最小、公平且可恢复的等待顺序。
- 保持现有 capacity、lease TTL、heartbeat、取消、timeout 和精确 owner release 语义。
- 证明新 waiter 不会越过仍有效的老 waiter，陈旧或取消的 waiter 不会永久阻塞队列。
- 不建设通用调度平台，不改变 Task Verification Result，也不调整 Project capability declaration schema。

不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: coordinated resource 从无序轮询抢占收敛为公平、可恢复且保持 owner 隔离的等待。

## Impact

- `services/buildr/src/application/verification/resource-coordinator.mjs`
- Verification resource coordination 的 Unit、Integration 与并发 System tests
- Task Verification canonical spec、contract/Skill 边界及验证实践文档
