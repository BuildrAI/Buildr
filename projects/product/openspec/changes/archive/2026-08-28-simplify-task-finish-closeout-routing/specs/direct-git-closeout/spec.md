## MODIFIED Requirements

### Requirement: 无 active Task 的收尾必须进入直接 Git 交付
当当前范围没有匹配的active Task且用户表达“收尾”或等价的当前Git交付意图时，Buildr MUST由`task-finish` Skill选择直接Git分支，而不是调用Formal Task Finish Application。

#### Scenario: 没有 active Task 但存在当前 Git 改动
- **WHEN** 当前范围没有匹配的active Task，当前checkout存在可归属的dirty/staged内容，且用户要求收尾
- **THEN** Agent MUST通过`task-finish` Skill解析当前repository、分支、remote、目标ref和exact owned scope
- **AND** Agent MUST在事实唯一时进入直接Git交付
- **AND** Agent MUST NOT创建临时Task或调用Formal Task Finish

#### Scenario: 历史 Task 不能被错误复用
- **WHEN** Workspace只有completed、abandoned或与当前范围不匹配的Task
- **THEN** 直接Git收尾 MUST将active Task视为不存在
- **AND** MUST NOT复用历史或无关Task的handoff、Environment、Candidate或Verification evidence

## ADDED Requirements

### Requirement: 直接 Git 收尾必须完成可证明的本地善后
直接Git收尾 MUST在远端回读成功后清理只属于本次交付且可重新证明安全删除的临时资源，并 MUST把未能安全清理的资源作为独立attention保留。

#### Scenario: 本次交付拥有临时工作树或资源
- **WHEN** 直接Git交付已经完成远端回读，且临时worktree、local branch或其他资源能够证明由本次收尾拥有并可安全删除
- **THEN** Agent MUST使用对应owner提供的安全操作完成清理
- **AND** MUST报告实际删除的资源和剩余状态

#### Scenario: 资源归属或删除安全无法证明
- **WHEN** 临时资源包含未交付内容、归属不明、被其他工作使用或缺少安全删除证明
- **THEN** Agent MUST保留现场并报告具体attention
- **AND** MUST NOT把未执行的清理报告为Environment Cleanup或成功删除
