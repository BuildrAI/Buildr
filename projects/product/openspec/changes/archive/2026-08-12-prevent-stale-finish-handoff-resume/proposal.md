## Why

Task Finish 的 blocked run 可以在 Development 已形成新 Candidate、generation 与 handoff 后继续恢复。现有检查只证明“存在一个 current handoff”，却允许旧 run 从历史 handoffs 找到旧 identity，并从已经变化的 Task source 重新形成 carrier，最终可能把新内容错误关联到旧 Candidate。

这破坏了 Finish Result 的身份一致性和确定性等价证明。问题已经在真实自举交付中出现，需要在下一次恢复发生前失败关闭。

## What Changes

- Task Development 的 carrier assertion 接受并核对冻结 run 的 handoff、Candidate、generation 与 Content Target identity；只有四项均等于 current handoff 时返回 equivalent。
- Task Finish 在 preflight、prepare、verify、deliver 和 resume 边界使用同一精确断言，不再自行遍历历史 handoffs 判断 currentness。
- blocked run 的 handoff 变化按既有副作用分级：无 carrier、lease、delivery 或 cleanup 事实时安全终结旧 run并要求为 current handoff 创建新 run；已有恢复资源或交付事实时保留现场并返回类型化 identity conflict。
- run factory 遇到同 Task、不同 identity 的 current run 时失败关闭，不再静默返回旧 run。
- current handoff 未变化的 retained Doctor resume 继续复用同一 run；新 handoff 必须重新提交并冻结 commit message。
- 不修改历史 terminal Finish Result，不手工改写 SQLite。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: carrier assertion 从“当前存在可交付 handoff”收紧为对调用方提供的冻结 handoff/Candidate/generation/Content Target 进行精确一致性断言。
- `task-finish-execution`: Finish resume、阶段复用、旧 run 失效与 run factory 的身份冲突行为改为严格失败关闭。

## Impact

- 影响 Task Development carrier operation contract、Application 与测试。
- 影响 Task Finish Application、run factory、Product executor、Result/diagnostic 和系统测试。
- 需要同步随包 capability contract、Skill 说明及其 workspace runtime 投射源；不新增数据库表、Receipt、状态机或外部副作用。
- 对正常首次 Finish 和 handoff 未变化的恢复保持兼容；依赖旧的宽松恢复行为属于缺陷行为，不保证兼容。
