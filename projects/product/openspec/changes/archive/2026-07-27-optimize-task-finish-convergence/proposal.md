## Why

Task Finish 已能在任务环境中完成候选收敛、验证、集成和推送，但集成后的 retained Workspace 检查仍由 Agent 临时拼接：常常机械执行 sync，也可能遗漏默认 CLI、Local App 入口或最终 doctor。并发任务下，这既产生重复验证和工具往返，也容易让即将删除的 task checkout 继续成为本机入口来源。

## What Changes

- 把集成后的 retained Workspace 收敛登记为 Task Finish 的标准、可执行步骤。
- 根据已验证的变更路径判定 runtime、默认 CLI 和 Local App 入口是否受影响；只执行必要动作，始终保留最终 doctor。
- 该步骤使用 retained checkout 的绝对产品入口和明确 Workspace root，不依赖当前 cwd，也不使用即将清理的 task CLI。
- 返回计划、实际动作、跳过原因、入口身份和 doctor 结果；失败只阻塞 runtime 收敛与清理，不重复集成、push 或 Candidate。
- 不改变正式验证政策，不在 retained checkout 重跑相同候选的完整验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 增加集成后 retained Workspace 的影响感知收敛步骤、执行身份和恢复语义。

## Impact

- Task Finish action registry、safe executor、run step 与 completion evidence。
- retained Workspace runtime sync、doctor、默认 CLI 和 Local App launcher 检查。
- 随包 `task-finish` Skill、CLI 文档、当前认知与任务看板。
- 不新增 daemon、全局队列或重复 Candidate 验证。
