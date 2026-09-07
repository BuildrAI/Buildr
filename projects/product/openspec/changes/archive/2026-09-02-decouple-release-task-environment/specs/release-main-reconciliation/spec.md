## MODIFIED Requirements

### Requirement: release 必须支持有证据的一次性 main reconciliation

Release owner MUST在完整Product Candidate前，针对current frozen selection读取main、release、dev provenance和matching Task Worktree execution identity，形成一次性reconciliation identity。该identity MUST包含版本、generation、selection、Worktree binding、main、release pre-state、coverage、resolution与post-state，MUST NOT包含Task Environment binding。

#### Scenario: current main 与 release 存在冲突
- **WHEN** current main不是release祖先，但其正式发布来源可由current dev baseline、ordered source commits或既有release evidence完整证明，且matching release Task Worktree current
- **THEN** owner MUST创建包含release parent与main parent的历史收敛commit，并递增release generation
- **AND** post-reconciliation tree MUST精确等于pre-reconciliation release tree，新post-state MUST作为后续Candidate的唯一source
- **AND** owner MUST NOT执行工作树merge、`ours` strategy、reset、rebase或force push

#### Scenario: reconciliation 产生新 release HEAD
- **WHEN** main coverage已通过，维护者明确授权在matching release Task Worktree中形成历史收敛
- **THEN** owner MUST创建以current main与原frozen release为父提交、tree等于原release tree的commit
- **AND** MUST记录两个父提交、coverage identity、resolution identity、post-reconciliation commit/tree并递增release generation
- **AND** MUST将新post-state作为后续Candidate的唯一source

#### Scenario: current main存在未覆盖的独有产品内容
- **WHEN** 任一main产品commit、changed path或release来源无法由current dev/release provenance完整证明
- **THEN** owner MUST在Git mutation前返回未覆盖内容、main/release pre-state与稳定coverage finding
- **AND** MUST要求先通过正式Task把该内容交付dev，MUST NOT把main内容直接merge或复制进release

#### Scenario: execution root不是matching release Environment
- **WHEN** repo位于retained primary worktree、其他Task worktree，或Worktree binding与Task、branch、HEAD任一不匹配
- **THEN** owner MUST在Git mutation前失败关闭并返回expected/actual execution identity
- **AND** MUST NOT切换retained workspace branch、创建merge现场、移动release refs或接受caller声明的matching状态

#### Scenario: reconciliation 输入发生漂移
- **WHEN** main ref、release ref、selection freeze、generation、Worktree binding或ownership在mutation前不再等于已检查identity
- **THEN** owner MUST在任何commit、ref或remote mutation前停止并返回漂移事实
- **AND** MUST保留当前selection、refs与checkout现场
