# direct-git-closeout Specification

## Purpose

无 active Task 时，根据 Workspace Git 事实完成当前工作树的安全 Git 交付，并报告独立 operation 结果。

## Requirements

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

### Requirement: 直接 Git 收尾必须对目标和历史改写 fail closed
直接 Git 收尾 MUST 只使用唯一或用户明确选择的目标 ref/remote，并 MUST 禁止未经明确恢复决策的冲突解决、共享历史改写和 force push。

#### Scenario: rebase 目标不唯一
- **WHEN** 当前 Workspace 无法唯一解析目标 ref、remote 或 destination branch
- **THEN** Agent MUST 返回 blocked 并说明需要的最少决策
- **AND** MUST NOT 猜测 `origin/dev` 或切换到其他 remote/ref

#### Scenario: rebase 发生冲突
- **WHEN** rebase 产生冲突或远端目标在操作期间漂移
- **THEN** Agent MUST 停止后续 push
- **AND** MUST 保留已经发生的 local effects
- **AND** MUST 将冲突恢复交还给用户或 caller

#### Scenario: rebase 将改写共享历史
- **WHEN** 被 rebase 的 commit 已共享，或普通 push 将被拒绝且只能通过 force push 完成
- **THEN** Agent MUST blocked
- **AND** MUST NOT force push、改写共享 history 或切换 push 策略

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

### Requirement: 直接工具交付必须同时支持有无任务
直接 Git 交付 MUST作为默认收尾方法，不以是否有 Buildr 任务分叉为两套交付流程。没有任务不创建；有任务通过已有应用保存结果。顺序由智能体（Agent）结合事实与授权选择，不强制变基或额外诊断。

#### Scenario: 任务已存在
- **WHEN** 用户有匹配任务并要求直接 Git 交付
- **THEN** 智能体 MUST核验仓库、目标、贡献与远端结果，之后保存任务结果，不补造正式验证或收尾记录。

#### Scenario: 任务不存在
- **WHEN** 用户没有匹配任务
- **THEN** 智能体 MUST只完成相关工具动作并报告事实，不写任务或环境状态。
