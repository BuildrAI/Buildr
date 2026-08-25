## Why

Candidate/Finish 前的关键一致性问题目前分散在 Task、Environment、Development、OpenSpec Change、验证与执行记录各自的读取路径中。确定性错误经常在重型操作启动后才暴露，Agent 也难以区分应修复、等待已有执行，还是继续推进；需要一个只读、可解释的收尾准入投影（closeout admission），减少无效重跑和错误完成。

## What Changes

- 在现有 `task next` 只读快照中增加收尾准入投影，统一检查 OpenSpec Change 可用性、责任方路由、目标身份、Environment、已有 Execution Record 与资源等待。
- 输出四种状态：`ready-for-finish`、`repair-before-finish`、`waiting-on-execution`、`blocked-by-user-decision`。
- 每个非 ready 状态返回责任方、确定性原因和下一条可执行命令；投影不写入状态、不启动测试、不自动重跑。
- 只有目标身份、Change/Owner 完整性等确定性错误阻断 Candidate/Finish 重型路径；无关开发、只读调查和有界非正式检查继续可用。
- 当准入提供者不可用时返回明确的 attention/blocked 事实，不把未知状态误报为 ready。

## Capabilities

### New Capabilities

- `task-closeout-admission`: 提供跨 Task 生命周期事实的只读收尾准入投影，统一对账 OpenSpec、Owner、Environment、目标身份、Execution Record 与资源等待，并输出四状态行动边界。

### Modified Capabilities

- 无。准入结果作为现有 `task next` 的 response-only 扩展提供，不改变既有 Task Entry 或 Execution Record 的 authority。

## Impact

- 影响 `product` Project 的 Buildr service Task Entry、Verification/Finish 前置读取和公共 JSON 投影。
- 不改变 Task、Environment、Development、Verification 或 Finish 的事实所有权；不新增持久化状态、数据库表或外部依赖。
- 需要补充单元、集成、契约和 CLI JSON 回归测试。
