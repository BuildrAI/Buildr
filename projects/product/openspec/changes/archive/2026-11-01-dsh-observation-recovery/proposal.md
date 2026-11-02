## Why

DSH 观察断线会立即结束宿主等待，后续结果没有补齐时，同一命令又被工具与后台任务重复统计。用户已确认正常恢复应静默完成。无破坏性变更。

## What Changes

有界重连期间保留原执行，分页补回结果和最终答复；失败耗尽才提示。按原生工具身份合并关联任务，不重新发送输入。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 短暂观察断线静默恢复及命令按实际身份计数。

## Impact

DSH 执行、观察、任务归属与集成测试；不变更账号权限或公开接口。[任务说明](@task/dsh-observation-recovery)。
