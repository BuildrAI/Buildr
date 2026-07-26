## Why

Task Finish 已有可恢复状态机，但正常路径仍由 Agent 串行领取、执行和提交每一步，真实补丁收尾仍耗时 7 分钟。需要让产品安全执行确定性步骤，减少工具往返，同时保留现有 checkpoint、lease 与失败恢复语义。

## What Changes

- 增加 Task Finish safe execution 入口，自动推进已声明且可预检的确定性步骤。
- 自动执行 doctor、OpenSpec guard、Git observation、runtime sync 和 evidence completion，并并行化互不依赖的只读检查。
- 遇到授权、副作用、身份漂移或失败时停止在现有 checkpoint，允许 inspect/resume。
- 输出自动执行步骤、耗时、停止原因和未执行动作的结构化证据。

## Capabilities

### Modified Capabilities
- `task-finish-execution`: 支持安全自动执行正常路径并保持 fail-closed checkpoint。

## Impact

- Buildr CLI Task Finish application、执行器与集成测试。
- Task Finish 正常路径目标由约 7 分钟继续收敛到约 3 分钟。
