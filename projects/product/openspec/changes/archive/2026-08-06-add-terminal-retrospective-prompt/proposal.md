## Why

Task Retrospective 已能按需记录执行效率复盘，但 Task 进入终态后没有稳定提示，用户容易不知道可以复盘。与此同时，Token 数据并非所有 Agent host 都可见，第一版不应为了补齐数字额外回放上下文、估算或扩大任务消耗。

## What Changes

- 正式 Task 完成或放弃后，由结束任务的 Agent 非阻塞地询问用户是否进行“任务复盘”，不自动运行复盘，也不改变终态结果。
- 提示统一使用长期名称“任务复盘”，并说明当前重点是 Agent 执行耗时、Token 消耗、重复尝试和人机协作效率。
- Token 数据改为明确的可选证据：Agent 能取得可信数据时记录数值、来源和覆盖范围，只能取得部分数据时说明范围，无法取得时直接标记缺失。
- 禁止为了 Token 数字额外回放完整对话、读取隐藏推理、强制估算或增加新的采集流程；Token 缺失不阻塞复盘。
- 通过 Task Record 与 Task Finish 的既有结果提示字段，以及随包 Task Manager、Task Finish、Task Retrospective Skills，让支持的 Agent runtime 获得一致行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: Task completed、completed no-change、abandoned 与 Formal Finish 成功后的 Agent 终态响应增加非阻塞“任务复盘”提示。
- `task-retrospectives`: 明确 Token 数据的可得、部分可得与缺失口径，以及不得为补齐 Token 增加额外消耗的边界。

## Impact

- Task Record Application 的 terminal operation result 与 Task Finish complete result。
- `task-manager`、`task-finish`、`task-retrospective` capability contracts、Skills、package/runtime 投影与一致性校验。
- Product current knowledge、Roadmap 与相关 unit/integration/system/contract tests。
- 不改变 Task Record、Task Retrospective Result 或 Task Finish Result 的 schema version，不新增数据库字段、自动采集器、门禁或 Local App 写入口。
