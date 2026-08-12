## Why

Task-scoped Change 的只读定位当前把整个 Environment `ready` 当成前置条件。开发过程中只要 runtime projection、依赖或其他非路径类 probe 暂时阻塞，已经存在且路径仍受 Receipt 证明的 Change 就会被误报为不可用，导致 Local App 和 Task read model 隐藏真实开发文档。

## What Changes

- 将 Task-scoped Change 的候选根解析改为读取持久化 Environment current，并独立校验 Task、Project scope、执行根、验证根与 Project source path。
- 当 Environment 整体为 `blocked`、但保存的 Receipt 仍能证明候选根且目录当前可读时，继续返回 task-environment candidate；非路径类 readiness 诊断不再隐藏 Change。
- 对 Receipt 缺失或 cleaned、Project scope 不匹配、路径归属不可证明、候选目录失效等情形继续 fail closed，并按既有规则回退 retained Project。
- 增加 ready、blocked-but-readable、路径失效和归属不可证明的回归测试。
- 不包含破坏性变更；不改变 Environment writer、ready 判定、Task Record authority 或全局 retained Change 索引。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `change-asset-indexing`: 调整 Task-scoped Change Resolver 对 Environment current 与路径可信度的判定，避免非路径类 readiness 阻塞隐藏可读 candidate。

## Impact

- 受影响实现：`services/buildr/src/application/change/change-application.mjs`。
- 受影响 consumer：Task Record Change 引用、Task Planning Identity、Task Review 与 Local App Task-scoped Change detail；它们继续复用同一 Resolver。
- 受影响验证：Change Application 集成测试与 Task-scoped Local App 系统测试。
- 无新增依赖、store、writer、公共 mutation API 或路径参数。
