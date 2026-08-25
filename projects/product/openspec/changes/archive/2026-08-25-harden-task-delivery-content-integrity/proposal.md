## Why

Buildr 已能让本地 affected/full 验证先通过低成本准入，也允许 Agent 在隔离交付载体中处理目标分支冲突；但两处内容完整性仍依赖人工自觉：HTTP 契约、生成 DTO、Buildr Web Client 与 Fresh Build fixture 的闭合错误可能直到重型测试才暴露，Agent-reviewed Delivery Adaptation 也可能只提交冲突文件而遗漏任务贡献中的其他路径。前者造成可避免的重复验证，后者会造成错误完成结论和交付证据失真，应该由最小确定性边界阻止。

## What Changes

- 在现有 Fast admission 中增加面向 HTTP 契约切片的低成本静态完整性检查；检查失败时，同次 affected/full execution 不启动尚未开始的重型步骤。
- 让 Agent-reviewed Delivery Adaptation 对账原 Task Contribution 的全部变更路径：每个路径必须由目标分支精确包含、由当前 Delivery Carrier 实际承接，或由 Agent 逐路径明确确认目标语义承接并提供理由；未对账路径阻止 adoption、deliver 与 cleanup proof。
- 为内容遗漏返回紧凑、稳定的缺失路径诊断和恢复方向，不复制完整 diff 或 stdout。
- 保持 Agent 对冲突语义、交付策略和是否改走 PR/直接 Git 的判断权；不要求语义差异机械等于原 patch，不新增长期状态、通用许可层或自动重试。
- 不包含正式验证运行时的 deadline、进程组、TERM/KILL、Browser 异步执行、资源声明或 Preview timeout；这些属于独立运行时边界。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：本地 affected/full 的 Fast admission 增加 HTTP 契约生成与 Fresh Build fixture 内容完整性 owner，并继续保持同次执行、无跨调用缓存。
- `task-closeout-orchestration`：Agent-reviewed Delivery Adaptation 增加 Task Contribution 路径覆盖不变量和缺失路径诊断，防止部分 carrier 被误报为完整交付。

## Impact

- 受影响模块：`projects/product/services/buildr/test/verification`、HTTP contract/DTO 静态检查、`src/task/application/finish` 及对应 contract/integration/system tests。
- 受影响规范：`product-verification-quality`、`task-closeout-orchestration`。
- 不改变 Task Record、Task Development、Verification Result、Candidate、Environment Receipt 或 Release artifact 的所有权。
- 不新增依赖、外部系统副作用、数据库表或新的正式生命周期状态。
