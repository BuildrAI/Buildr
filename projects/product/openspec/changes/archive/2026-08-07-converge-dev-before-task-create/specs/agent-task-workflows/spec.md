## ADDED Requirements

### Requirement: task-triage 必须在正式 Task 创建前收敛统一 dev 基线
当 `task-triage` 已确认进入正式持久交付且需要创建新 Task Record 时，Agent MUST 在调用 Task Record `create` 前解析完整 repository set，并通过 selected `buildr.git-operations/v1` provider 将每个仓库的 clean `dev` 收敛到本次 fetch 后的 `origin/dev`。只有全部仓库成功且适用的 Workspace transition check 已 ready 时才能创建 Task；Task Record Application 与 Task Environment MUST NOT 因此获得 Git mutation authority。

#### Scenario: 全部仓库已对齐或成功收敛
- **WHEN** 完整 repository set 均处于 clean `dev`、upstream 为 `origin/dev`，且 `fetch origin dev` 与 `rebase origin/dev` 全部成功
- **THEN** task-triage MUST 核对每个仓库的 before/after branch、HEAD 与实际 effects
- **AND** MUST 仅在适用的 Workspace transition check ready 后调用 selected Task Record provider 的 `create`

#### Scenario: 本地未 push commit 与远端同时前进
- **WHEN** 仓库 clean、本地 `dev` 含未 push 且未共享的 commit，并且 fetch 后 `origin/dev` 已前进
- **THEN** task-triage MUST 将 repository、`rebase` operation、`dev` 与 `origin/dev` 明确交给 selected Git Operations provider
- **AND** rebase 成功后 MUST 以新的 local commit identity 继续创建前门禁

#### Scenario: repository 前置事实不满足
- **WHEN** 任一仓库不是符号分支 `dev`、upstream 不是 `origin/dev`、working tree/index dirty、存在进行中的 Git operation，或 remote/ref/共享风险无法证明
- **THEN** task-triage MUST 在该仓库 tree/history 零写入状态阻塞 Task 创建并报告当前事实
- **AND** MUST NOT 自动 checkout、stash/autostash、merge、force push、选择其他分支或改变策略

#### Scenario: fetch 或 rebase 失败
- **WHEN** 任一仓库 fetch 失败、remote/ref 漂移、rebase 失败或出现冲突
- **THEN** task-triage MUST 不调用 Task Record `create`，并报告全部仓库已经发生的 effects 与当前 Git facts
- **AND** MUST NOT 把多仓库部分成功报告为零变化或原子回滚

#### Scenario: clean pre-state 的 rebase 冲突可恢复
- **WHEN** rebase 在已证明 clean 的仓库发生冲突，且 `rebase --abort` 能恢复精确 pre-rebase branch、HEAD 与 clean 状态
- **THEN** selected Git Operation MUST 报告 conflict 与 recovered abort effects，Task 创建仍 MUST blocked
- **AND** abort 无法完成或恢复 identity 无法证明时 MUST 保留并报告真实冲突现场

#### Scenario: Git Operations provider 不可用
- **WHEN** 新正式 Task 创建分支无法解析 ready `buildr.git-operations/v1` selected provider
- **THEN** task-triage MUST 只阻塞 Git 基线收敛与 Task Record create
- **AND** 纯讨论、只读探索、已有 Task inspect 和不依赖该动作的语义判断 MUST 保持可用
