# 修复验证 detached descendant 回收

## Why

第一阶段真实 Task Finish 在两轮 `product.fast` 后遗留 7 个 Local App fixture 进程。现有 runner 只在主进程关闭后终止原 process group；descendant 若在此之前脱离原 group 或被重新托管，就失去可回收 identity。

## What Changes

- 在 POSIX verification step 运行期间持续采样并记录由 runner 启动树产生的精确 descendant PID。
- step 结束时先清理原 process group，再清理仍存活的已记录 descendant；不按端口、进程名或 workspace 宽泛匹配。
- 增加 detached/reparented descendant 回归测试。
- 增加真实 Task Finish completion 集成测试，证明规范化 plan 保留 `availableSelectors`，completion 不再误阻塞。

## Capabilities

### Modified Capabilities

- `agent-task-workflows`: 明确 detached/reparented descendants 仍属于 runner-owned cleanup 范围。
- `task-finish-execution`: completion 必须能重放已规范化的 verification selector declaration。

## Impact

仅影响 Buildr Product verification runner、Task Finish execution plan 测试与相关契约；不降低验证覆盖，不采用全局进程扫描作为清理 authority。
