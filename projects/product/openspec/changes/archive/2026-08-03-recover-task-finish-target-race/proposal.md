## Why

当目标分支在候选冻结后前进时，Task Finish 会正确停止为 `task-finish.target-race`。但当前持有产品生成 resume token 的重试只进入 `deliver`，仍使用旧候选冻结时的目标 ref，因此会在同一比较处永久 blocked，无法安全完成原任务。

现在需要让产品在保持 token 与目标 ref 保护的前提下，重新基于当前 `dev` 生成候选、建立匹配的验证 evidence，再继续交付。

## What Changes

- 将 `task-finish.target-race` 的有效 token 恢复限定为候选依赖阶段的产品化重新开始：保留已通过的 `preflight`，失效 `prepare`、`verify`、`deliver` 与其下游 cleanup 状态及旧候选/验证/交付输出。
- 重试时由既有 `prepare` 重新 rebase、冻结当前目标上的候选；随后由既有 `verify` 建立或取得与新候选匹配的 Result，最后才允许 `deliver`。
- 保持 CLI 输入、resume token 校验、target lease 和 fast-forward 保护不变；不增加调用方恢复参数、通用 restart 命令、手写 recovery manifest 或 target 覆盖能力。
- 其他 blocked 原因继续从原先最早 blocked phase 恢复，不因本修复被重置。

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `task-finish-execution`: target-race 恢复必须使旧 frozen candidate 及验证 evidence 失效，并从 prepare 重新建立可交付候选。

## Impact

- 受影响实现：`services/buildr/src/application/task-finish/task-finish-run.mjs`。
- 受影响验证：Task Finish run 集成测试及现有候选/恢复断言。
- 受影响当前认知：Buildr Service 与 OpenSpec Change lifecycle 对 target-race 恢复语义的说明。
