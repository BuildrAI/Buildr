## Why

Parent Coordination v2 在同一结果中重复返回完整 Parent Plan、rich projection、work item 静态内容和多个兼容别名。P1 已把查询降到毫秒级，但大型 Parent 的公开 JSON 仍有约 45–52 KB，并直接进入 Agent context，因此现在需要在不改变协调语义和写入 authority 的前提下收敛唯一紧凑协议。

## What Changes

- **BREAKING**：将 Parent Coordination 全部 action 的公开结果直接升级为 `buildr.parent-coordination-result/v3`，不保留 v2 compatibility adapter。
- 只保留一个 `plan` 摘要和一份顶层 rich `contributions`；删除 `parentPlan`、`plan.contributions`、`finalAcceptanceReady`、`nextActions` 等重复字段。
- work item 只通过 `expectation` 表达 expected Child，Child 只通过 `boundContributions` 表达实际绑定；不再返回同义 alias。
- 将 Planning Review 和 Child Contribution Handoff 收敛为 Parent coordination 所需摘要，完整专业 Result 继续由各自 Application 提供。
- 同步 CLI、HTTP、Buildr Web、随包 Agent workflow、JSON registry、文档和自动验证，并用大型 fixture 保护响应体积与无重复结构。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-json-contracts`: 定义 Parent Coordination v3 的破坏性迁移、唯一字段和 v2 终止策略。
- `parent-child-task-coordination`: 收敛 Parent Plan、work item、Review、Child 与 handoff 的派生 read model 形状。
- `cli-product-surface`: 让全部 Parent coordination action 只返回 v3，并移除 v2 字段。
- `local-app-web-client`: 让 Buildr Web 直接消费 v3，不在前端保留 v2 alias 或兼容分支。
- `agent-task-workflows`: 让 Agent workflow 只读取 v3 canonical 字段。
- `buildr-package-assets`: 保证 checkout、npm package、HTTP 和 `web-dist` 交付同一 v3。

## Impact

- Application/CLI/HTTP：Parent Coordination result projector、公开 schema registry、错误 envelope 和 Local App worker。
- Buildr Web：Task detail response type 与 Parent/Child coordination panel。
- Agent assets：随包 `task-development`、`task-triage` 等直接消费 Parent coordination 的说明。
- OpenSpec/current knowledge/docs：公开 JSON、Parent/Child coordination、CLI、Web 与 package parity。
- 测试：Domain/Application/CLI/HTTP/Web/Browser/contract/system coverage，以及大型 Parent payload size budget。
- 数据与存储：无 SQLite migration、无 backfill、无 cache、无新 writer。
