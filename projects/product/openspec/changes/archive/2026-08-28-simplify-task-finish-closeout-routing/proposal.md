## Why

用户只需要表达“收尾”或“交付”，不应先判断当前工作是否绑定 Buildr Task。现有运行时把正式 Task Finish 和无任务直接 Git 收尾暴露为两个入口，容易让 Agent 在入口选择上提前结束、误路由或把内部术语交给用户。

## What Changes

- 将 `task-finish` 调整为统一的收尾与交付入口，先识别当前范围内是否存在匹配的未结束 Buildr Task。
- 有匹配 Task 时，按 `task next` 和各专业 owner 持续推进，形成 current Development handoff 后完成正式 Finish、终态确认和 Environment cleanup。
- 没有匹配 Task 时，由同一 Skill 选择直接 Git 收尾，依次调用独立 Git Operations 完成精确提交、目标收敛、普通推送、远端回读与可证明归属的本地清理。
- 保持正式 Delivery evidence 与直接 Git Operation Result 相互独立；历史、已放弃或无关 Task 不得劫持当前 Git 收尾。
- 重写 Skill 的触发描述和正文结构，以中文为主，仅保留必要的稳定英文标识，删除重复、互斥和产品实现细节。
- 不改变 `buildr.task-finish/v1` 的正式交付保证，不引入强制推送、共享历史改写或无法证明归属的清理授权。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：把正式 Task 与无 Task 的收尾从两个用户入口调整为同一 `task-finish` Skill 内的事实分支。
- `direct-git-closeout`：明确直接 Git 收尾由统一 Skill 选择，但仍只产生独立 Git Operation Result。
- `buildr-package-assets`：更新随包 Skill 的触发描述、依赖使用和 source/package/runtime 一致性要求。

## Impact

- 工作区源技能、manifest 描述与随包 Buildr Skill 路由说明。
- `agent-task-workflows`、`direct-git-closeout`、`buildr-package-assets` 规范及对应静态、包资产和运行时投射验证。
- `buildr.task-finish/v1` 正式能力契约保持兼容；`buildr.git-operations/v1` 仍是按单次动作调用的窄能力。
