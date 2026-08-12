## Why

当前 `task-retrospective` 会在用户只说“处理、检查或看看复盘”时，从只读重判直接进入 Task 关系写入和 disposition 处置；`currentDigest` 只能防止并发覆盖，不能证明用户已经同意具体写入。这会把讨论授权误当成 mutation 授权，使 Agent 可能在用户确认前把复盘标记为 `handled`、`no-action` 或创建、关联承接 Task。

## What Changes

- 把 Agent 处理 current 复盘明确拆成“只读检查与讨论”和“取得明确授权后写入”两个阶段。
- 将“处理、检查、查看、分析复盘”等宽泛表达限定为只读 `inspect`、当前事实重判和拟处置方案展示；用户未明确选择 disposition 与 Task 关系 effects 时保持 `pending` 且零写入。
- 允许用户已经直接指定“标记无需处理”“按所列 Task 标记已处理”“重新打开”等完整动作时直接执行，不机械要求重复确认。
- 在 `buildr.task-retrospective/v2` contract、`task-retrospective` Skill、canonical spec 与 package contract test 中共同固化授权边界。
- 不修改 SQLite schema、Task Retrospective Application、内部 driver、Local App 或公开 JSON shape；不增加由 Agent 自报的 approval flag。
- 不包含破坏性 API 或数据变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-retrospectives`: 明确 Agent 在处置 current 复盘或写入承接 Task 关系前必须取得针对具体 effects 的用户授权，并规定宽泛处理请求只授权只读讨论。

## Impact

- OpenSpec：`task-retrospectives` canonical spec 增加 Agent 授权场景。
- Package assets：更新 `task-retrospective` Skill 与 `buildr.task-retrospective/v2` contract 的授权和停止条件。
- Verification：扩充 `test/contract/task-retrospective.test.mjs`，防止未来投射重新退化为自动处置。
- Runtime：交付后通过 Buildr package sync 投射到 workspace Skills 与各 Agent runtime；当前 Change 不直接编辑投射副本。
