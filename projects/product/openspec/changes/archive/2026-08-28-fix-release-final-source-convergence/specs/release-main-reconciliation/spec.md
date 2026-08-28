## MODIFIED Requirements

### Requirement: release 必须支持有证据的一次性 main reconciliation
Release owner MUST在完整 Product Candidate 前，针对当前未公开版本的 frozen release selection读取并固定current `main` commit/tree、release commit/tree、matching release Task Environment与dev/release provenance，形成一次性 reconciliation identity。Owner MUST先证明current main的产品内容已经由current dev baseline、ordered source commits或既有正式release provenance覆盖；coverage通过时 MUST创建一个以原frozen release与current main为父提交、且tree精确等于pre-reconciliation release tree的历史收敛commit。该identity MUST包含版本、generation、selection identity、Environment binding、main identity、release pre-state、coverage identity、resolution identity与post-state，并 MUST区分dev source provenance与main reconciliation provenance。

#### Scenario: current main 与 release 存在冲突
- **WHEN** current main不是release祖先，但其正式发布来源可由current dev baseline、ordered source commits或既有release evidence完整证明，且matching release Task Environment current
- **THEN** owner MUST创建包含release parent与main parent的历史收敛commit，并递增release generation
- **AND** post-reconciliation tree MUST精确等于pre-reconciliation release tree，新post-state MUST作为后续Candidate的唯一source
- **AND** owner MUST NOT执行工作树merge、`ours` strategy、reset、rebase或force push

#### Scenario: reconciliation 产生新 release HEAD
- **WHEN** main coverage已通过，维护者明确授权在matching release Task Environment中形成历史收敛
- **THEN** owner MUST创建以current main与原frozen release为父提交、tree等于原release tree的commit
- **AND** MUST记录两个父提交、coverage identity、resolution identity、post-reconciliation commit/tree并递增release generation
- **AND** MUST将新post-state作为后续Candidate的唯一source

#### Scenario: current main存在未覆盖的独有产品内容
- **WHEN** 任一main产品commit、changed path或release来源无法由current dev/release provenance完整证明
- **THEN** owner MUST在Git mutation前返回未覆盖内容、main/release pre-state与稳定coverage finding
- **AND** MUST要求先通过正式Task把该内容交付dev，MUST NOT把main内容直接merge或复制进release

#### Scenario: execution root不是matching release Environment
- **WHEN** repo位于retained primary worktree、其他Task worktree，或Environment binding与Task、worktree、branch、HEAD任一不匹配
- **THEN** owner MUST在Git mutation前失败关闭并返回expected/actual execution identity
- **AND** MUST NOT切换retained workspace branch、创建merge现场、移动release refs或接受caller声明的matching状态

#### Scenario: reconciliation 输入发生漂移
- **WHEN** main ref、release ref、selection freeze、generation、Environment binding或ownership在mutation前不再等于已检查identity
- **THEN** owner MUST停止并返回structured conflict finding
- **AND** MUST保留已有Git、Task与Candidate历史事实且MUST NOT覆盖远端ref

### Requirement: reconciliation 必须使下游发布证据按 generation 重建
Buildr MUST只允许完成current main coverage与历史收敛后的最终release generation进入完整Product Candidate。Reconciliation改变release commit时，即使tree保持不变，也 MUST使旧Candidate aggregate、tarball、readiness context、carrier与release→main PR source失效，并 MUST从新的generation重新创建matching Candidate、唯一artifact、readiness与carrier。相同输入且live readback完全一致时 MUST支持幂等复用。

#### Scenario: reconciliation 后旧 Candidate 仍存在
- **WHEN** 历史run或迁移中的Candidate绑定pre-reconciliation release commit
- **THEN** readiness MUST返回stale或blocked
- **AND** publication owner MUST拒绝旧aggregate、旧tarball和旧PR head，即使source tree相同

#### Scenario: 新 generation 重新验证
- **WHEN** main coverage与历史收敛已通过、新release generation已形成且Environment/worktree clean
- **THEN** Candidate admission MUST绑定新的release commit/tree与generation
- **AND** aggregate artifact、readiness context与carrier MUST引用同一最终source identity

#### Scenario: Candidate后main发生漂移
- **WHEN** current main commit不再等于final source reconciliation绑定的main parent
- **THEN** readiness MUST使Candidate与carrier stale，并要求重新coverage/reconciliation
- **AND** MUST NOT在Candidate后直接merge main、沿用旧tarball或只重跑readiness

#### Scenario: 幂等恢复
- **WHEN** reconciliation请求的全部输入与已记录post-state相同，且live main/release refs、Environment binding、coverage与resolution identity未漂移
- **THEN** owner MUST返回既有reconciliation identity和`already-converged`状态
- **AND** MUST NOT创建第二个history commit或递增generation
