## Why

Local App 的研发、审查和验证页签目前都经由 `inspectTaskTerminalDelivery` 聚合读取，单次 GET 会重复触达多个专业 current record，并把各页签的读取边界绑定到一个不属于它们的终态投影。终态交付关联已经由 Finish 持久化，现在应让每个页签直接读取自己的专业事实与已写关联，降低读取次数并保持事实 authority 清晰。

## What Changes

- development、reviews、verification 三个 GET view 分别调用对应的 Development、Review、Verification Application read model。
- 三个 view 只读取共享 Task Record 和已写入 lifecycle read model 的 terminal association，不再调用完整 `inspectTaskTerminalDelivery` 聚合投影。
- 保持三个公开 response schema、字段兼容、`no-store` 和只读安全边界；active、no-change、abandoned、completed-unproven 与 delivered 语义继续由保存事实决定。
- 增加调用次数与跨页签隔离测试，证明单个页签不会读取其他专业正文或重新匹配当前 handoff/gate。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-workspace-application`：三个 Task 专业页签必须直接读取自身专业 current record 与已写终态交付关联，不得依赖完整终态聚合投影。

## Impact

- 影响 `src/application/task-terminal-delivery/task-terminal-delivery-application.mjs`、Local App HTTP Task routes 及对应 Local App/system tests。
- 不改变 Task Record、Development、Review、Verification 或 Finish 的 writer authority，不改变 structured store 定位，也不引入第二份缓存或新的持久化表。
