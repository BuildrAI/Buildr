## Why

正式 Task Finish 当前把任务贡献重新提交到隔离交付载体时，固定使用“交付 + Task ID”作为提交主题，并丢弃任务分支已有提交的语义信息。随着正式收尾成为主要交付路径，Git 历史集中退化为无法说明最终内容的机械记录，也违反现有“提交信息描述最终内容”的产品约定。

## What Changes

- 首次执行 `buildr task finish run` 时要求 Agent 提供符合当前仓库约定的语义交付提交信息。
- 产品规范化并冻结最终提交信息，将 Task ID 作为追踪 trailer，而不是提交主题。
- Delivery Carrier 创建、阻塞恢复和 target-race 恢复始终复用同一冻结信息，不在重试时重新生成。
- 拒绝缺失、空白或仍使用“交付 + 当前 Task ID”占位主题的输入，并返回明确修复动作。
- Task Finish 结果只公开提交信息的稳定身份与主题，不把完整正文复制到其他 Task authority。
- 不改变 Candidate、Task Contribution、Delivery Carrier 等价性、远端交付、Environment cleanup 或 Git 历史安全边界。

本变更不包含破坏性数据迁移；但首次启动新的正式 Finish run 时，CLI 新增必需的语义提交信息输入。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: Task Finish 必须消费、冻结和复用 Agent 提供的语义交付提交信息，并将 Task ID 仅作为追踪 trailer。

## Impact

- Task Finish CLI 帮助、参数校验与入口 readiness。
- `buildr.task-finish-run/v2` current run identity、SQLite 持久化和 compact result 投影。
- 隔离 Delivery Carrier 的 Git commit 创建逻辑。
- Task Finish integration/system/contract 测试与 package/runtime 文档资产。
- 不新增 dependency、SQLite 表、capability、provider 或 binding。
