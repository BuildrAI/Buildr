# direct-git-closeout Specification

## Purpose

无 active Task 时，根据 Workspace Git 事实完成当前工作树的安全 Git 交付，并报告独立 operation 结果。

## Requirements

### Requirement: 无 active Task 的收尾必须进入直接 Git 交付
当 Workspace 没有 active Task 且用户表达“收尾”或等价的当前 Git 交付意图时，Buildr MUST 将该意图路由到直接 Git 收尾，而不是 Task Finish。

#### Scenario: 没有 active Task 但存在当前 Git 改动
- **WHEN** Workspace 没有 active Task，当前 checkout 存在可归属的 dirty/staged 内容，且用户要求收尾
- **THEN** Agent MUST 解析当前 repository、分支、remote、目标 ref 和 exact owned scope
- **AND** Agent MUST 在事实唯一时进入直接 Git 交付
- **AND** Agent MUST NOT 创建临时 Task 或调用 Formal Task Finish

#### Scenario: 历史 Task 不能被错误复用
- **WHEN** Workspace 只有 completed 或 abandoned Task
- **THEN** 直接 Git 收尾 MUST 将 active Task 视为不存在
- **AND** MUST NOT 复用历史 Task 的 handoff、Environment、Candidate 或 Verification evidence

### Requirement: 直接 Git 收尾必须按明确顺序执行
直接 Git 收尾 MUST 由产品入口选择顺序，并通过 `buildr.git-operations/v1` provider 执行独立 operation；默认顺序为观察与 fetch 目标 ref、必要时精确 commit、rebase 到目标 ref、普通 push 和适用的远端回读。

#### Scenario: dirty 内容完成收尾
- **WHEN** 当前 dirty 内容全部属于本次收尾 scope，且 repository、目标 ref 与 push destination 唯一
- **THEN** Agent MUST 只暂存 exact paths 或可可靠分离的 hunks
- **AND** MUST 在 rebase 前完成精确 commit
- **AND** MUST 在 commit 后 fetch 目标 ref、rebase 当前分支并执行普通 push
- **AND** MUST 分别报告 commit、rebase 和 push 的实际 effects

#### Scenario: 工作树含无法分离的无关内容
- **WHEN** 当前工作树含 scope 外 dirty、scope 外 staged、ownership 不明的 hunk 或需要临时 stash 才能继续
- **THEN** 直接 Git 收尾 MUST 在零 Git 写入状态 blocked
- **AND** MUST NOT 自动 stash、reset、覆盖或回滚用户内容

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

### Requirement: 直接 Git 收尾不得伪造正式生命周期证据
直接 Git 收尾 MUST 只产生 Git Operation Result，不得修改 Task Record、Development、Review、Verification、Candidate、Task Finish 或 Environment cleanup 状态。

#### Scenario: 直接 Git 交付成功
- **WHEN** fetch/rebase、commit 和 push 均成功且远端 ref 回读符合预期
- **THEN** Agent MUST 报告 `Direct Git Delivery` 及每个 operation 的 before/after identity、range 和 effects
- **AND** MUST NOT 报告 Formal Task Finish、formal Verification 或 Task completed

#### Scenario: rebase 改变已检出 tree
- **WHEN** 直接 Git 收尾中的 rebase 成功改变已初始化 Buildr Workspace 的 checked-out tree
- **THEN** Agent MUST 在无未解决冲突后运行当前 Agent 的 Workspace Doctor
- **AND** Doctor 结果 MUST 与 Git Result 分开报告
