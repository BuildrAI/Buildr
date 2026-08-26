# release-main-reconciliation Specification

## Purpose

定义 release 与当前 main 发生一次性 reconciliation、重建发布 generation、绑定父提交与 resolution provenance，并以受保护 merge commit 完成 release→main 收敛的产品契约。

## Requirements

### Requirement: release 必须支持有证据的一次性 main reconciliation
Release owner MUST能够针对当前未公开版本的 frozen release selection，读取并固定当前 `main` commit/tree 与 release commit/tree，形成一次性 reconciliation identity。该 identity MUST包含版本、generation、selection identity、main identity、release pre-state、resolution identity 与 post-state，并 MUST区分 dev source provenance 与 main reconciliation provenance。

#### Scenario: current main 与 release 存在冲突
- **WHEN** current release candidate 已冻结、目标版本尚未公开，且 release→main carrier 与当前 `main` 无法直接 cleanly converge
- **THEN** owner MUST返回冲突 paths、main/release pre-state 和可恢复的 reconciliation identity
- **AND** owner MUST NOT使用 `ours`、reset、rebase、force push 或把未解决现场标记为成功

#### Scenario: reconciliation 产生新 release HEAD
- **WHEN** 维护者明确授权并在隔离 execution worktree 解决冲突
- **THEN** owner MUST创建一个以 current `main` 与原 frozen release 为父提交的 merge commit
- **AND** MUST记录两个父提交、resolution identity、post-reconciliation commit/tree，并递增 release generation
- **AND** MUST将新 post-state 作为后续 Candidate 的唯一 source

#### Scenario: reconciliation 输入发生漂移
- **WHEN** main ref、release ref、selection freeze、generation 或 ownership 在 mutation 前不再等于已检查 identity
- **THEN** owner MUST停止并返回 structured conflict finding
- **AND** MUST保留已有 Git/Task/Candidate 事实且 MUST NOT覆盖远端 ref

### Requirement: reconciliation 必须使下游发布证据按 generation 重建
当 reconciliation 改变 release commit 或 tree 时，Buildr MUST使旧 Candidate aggregate、tarball、readiness context、carrier 与 release→main PR source 失效，并 MUST从新的 generation 重新创建 matching Candidate、唯一 artifact、readiness 和 carrier。相同输入且 live readback 完全一致时 MUST支持幂等复用。

#### Scenario: reconciliation 后旧 Candidate 仍存在
- **WHEN** post-reconciliation release commit/tree 与旧 Candidate source 不同
- **THEN** readiness MUST返回 stale 或 blocked
- **AND** publication owner MUST拒绝旧 aggregate、旧 tarball 和旧 PR head

#### Scenario: 新 generation 重新验证
- **WHEN** 新 release generation 已形成且工作树 clean
- **THEN** Candidate admission MUST绑定新的 release commit/tree 与 generation
- **AND** aggregate artifact、readiness context 与 carrier MUST引用同一新 source identity

#### Scenario: 幂等恢复
- **WHEN** reconciliation 请求的全部输入与已记录 post-state 相同，且 live main/release refs、resolution identity 未漂移
- **THEN** owner MUST返回既有 reconciliation identity 和 `already-converged` 状态
- **AND** MUST NOT创建第二个 merge commit 或递增 generation

### Requirement: release→main PR 必须使用 merge commit 收敛
对于采用 reconciliation 的 release，发布 owner MUST只创建或复用一个以当前 generation carrier 为 head、以 `main` 为 base 的受保护 PR，并 MUST以 GitHub merge commit 方式完成。squash merge、rebase merge 和未绑定 generation 的直接 merge MUST不满足发布收敛证据。

#### Scenario: merge commit 合入 main
- **WHEN** current Candidate、唯一 artifact、readiness、carrier 和 PR head 均匹配，且维护者授权 release→main 合入
- **THEN** owner MUST使用 `Create a merge commit` 完成 PR
- **AND** MUST证明 main commit 有 carrier/release source 与原 main commit 的父关系，且 main tree 等于 current release tree

#### Scenario: PR 使用错误的合入方式
- **WHEN** release PR 以 squash 或 rebase 完成，或 GitHub readback 无法证明两个父提交关系
- **THEN** readiness MUST阻止 publication/closeout
- **AND** owner MUST NOT用 tree 相等替代 merge-commit evidence

#### Scenario: main tree 不一致
- **WHEN** merge 后 `origin/main^{tree}` 不等于 current release tree
- **THEN** convergence MUST返回 expected/actual identity mismatch
- **AND** MUST NOT继续 publication、force push 或重写 main 历史
