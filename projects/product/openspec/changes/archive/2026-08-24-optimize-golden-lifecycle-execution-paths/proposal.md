## Why

Product 日常 Core 的选择范围已经收窄，但完整 Finish 等黄金 owner 仍把不承担主证据的 Git 仓库搭建重复到每个 case，且现有 timing 只能看到 owner 总耗时，无法区分 prepare/body/wait/cleanup。现在需要在不削弱真实生命周期证据的前提下减少这些重复，并用同口径实测决定诚实预算。

## What Changes

- 对 `system-task-finish` 试验现有 Prepared Fixture Provider 的独立Git物化；只有多轮稳定更快才替代非主证据init/clone/config，否则保持独立准备并记录反例。
- 为黄金 journey 记录 prepare/body/wait/cleanup 分段耗时，并同时记录 Prepared Fixture 的 prepare/materialize 成本。
- 以改造前后同 owner 实测、三轮干净 Core、竞争 Core/affected 和完整 Candidate/Release 校准预算与数学下限；不缓存被测结果、不扩大并发、不改变 Candidate/Release authority。
- 不引入第二套 Test Context Runtime，不共享可写 Workspace、Git worktree、SQLite connection、用户 profile 或跨 case 进程状态。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 明确黄金 owner 的只读准备复用、独立可写 sandbox、完整真实路径保留和 prepare/body/wait/cleanup 验收证据。

## Impact

影响 Product System verification harness、`system-task-finish` suite registry、黄金 journey 测试和验证审计文档。公共 CLI、Task Finish 行为、Core/Candidate membership、Release tarball/Launcher/smoke/readback authority 均不改变。
