## Why

真实 Task Finish 收尾中，受影响验证的所有检查已经写出通过诊断，但聚合执行器没有结束、也没有生成最终 summary；中止后，Task Finish 又拒绝接受失败或不完整的正式验证证据，使 formal-assurance attempt 永久停留在 `running`。这会同时破坏收尾可恢复性、耗时审计和 Agent 的判断边界，必须先于后续效率优化修复。

## What Changes

- 让正式验证聚合执行在成功、检查失败、异常、中止或超时后都进入有界终态，并写出可信的 `passed|failed|incomplete` summary。
- 为仍未结束的子进程或资源清理设置有界终止与诊断，精确保留当前 run 的进程、资源和清理责任，不触碰其他并发任务。
- 修复 verification fixture 使用的 task preview 在 stop 后只清记录、不退出进程的问题，使成功 summary 不再掩盖 reparent orphan。
- 为“直接子进程退出但后代继续持有 stdio”“聚合 close 超时”和“失败 summary 仍可写出”增加回归测试。
- 不改变正式验证通过门槛，不允许 `failed|incomplete` evidence 推进 archive、integration、push 或 cleanup。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: 正式验证聚合执行必须在所有退出路径产出有界、可诊断的终态 summary，并精确处理当前 run 的进程和资源清理。

## Impact

- 影响 Buildr Product 的验证计划执行器、并行进程管理、timing summary 写入和正式验证 CLI。
- 修正现有 `worktree-local-app-preview` 停止契约的实现，不改变默认 Local App 行为。
- 增加 unit、fast integration 和 verification runner journey 回归覆盖；不引入外部依赖或破坏性 API 变更。
- Task Finish 对失败/不完整 summary 的持久化修复保留在依赖本 Change 的 `harden-task-finish-identity-timing` 中完成，避免复制其尚未集成的候选实现。
