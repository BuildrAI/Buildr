## MODIFIED Requirements

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
Buildr Product Project的发布引导 MUST先把通过完整Candidate的current release tree经唯一受保护release→main PR以当前发布策略收敛到`main`；对于发生main reconciliation的release，PR MUST使用merge commit并记录main与release的父提交关系，且要求tree完全一致。正式Publication成功后，再以current frozen selection和remote Git facts核验全部发布内容的dev provenance。两次动作 MUST分别核验identity和授权，且post-publication reconciliation MUST只读、允许`dev`保留release冻结后的新内容并保持线性历史。

#### Scenario: Finish 后先完成 self-bootstrap activation
- **WHEN** 一个被release选择的release/support Task已经通过Finish交付，且其Workspace contribution适用self-bootstrap
- **THEN** Agent MUST在冻结release Candidate与构造transaction correlation前取得matching runner的`passed`或带完整plan的`not-applicable`结果
- **AND** correlation MUST核验Task、Finish run、delivered ref、plan、status和result identity
- **AND** runner blocked、failed或identity不匹配 MUST只阻塞消费该Activation的后续动作，不得改写已成立Delivery

#### Scenario: reconciliation 后以 merge commit 收敛
- **WHEN** release→main PR已完成一次有证据的main reconciliation并按仓库保护策略使用merge commit
- **AND** `origin/main^{tree}`与current release tree identity相同
- **THEN** Agent MUST把main source记录为matching publication input，并保留两个父提交与reconciliation identity
- **AND** MUST NOT仅因最终main commit identity不同而重复Candidate或重建tarball

#### Scenario: squash 后候选 tree 完全一致
- **WHEN** release→main PR使用squash merge，且`origin/main^{tree}`与冻结release tree identity相同
- **THEN** Agent MUST NOT把tree相等单独记录为满足merge-commit reconciliation的publication input
- **AND** readiness MUST要求重新建立merge-commit父提交证据后才能继续publication或closeout

#### Scenario: squash 结果与已验证候选 tree 不一致
- **WHEN** release→main PR使用squash merge，且`origin/main^{tree}`不等于冻结release tree
- **THEN** Agent MUST停止publication和后续reconciliation并报告expected/actual identities及错误合入方式
- **AND** MUST NOT使用`ours`、force push、reset或历史重写掩盖内容差异

#### Scenario: self-bootstrap evidence 缺失或不匹配
- **WHEN** release correlation需要的self-bootstrap result缺失，或schema、Task、Finish run、delivered ref、plan、status与current facts不匹配
- **THEN** readiness MUST在Candidate/publication实际消费该事实前失败关闭并报告matching owner恢复方向
- **AND** MUST NOT从聊天、临时stdout、近似Git ancestry或caller摘要推断Activation完成

#### Scenario: main 已是 dev 祖先
- **WHEN** Publication成功后current frozen selection identity与transaction一致，且baseline和全部`sourceDevCommit`均由current remote `dev`包含
- **THEN** Agent MUST将post-publication reconciliation视为幂等完成并保留current dev HEAD
- **AND** MUST NOT要求published main成为dev祖先、重复Candidate或重新publish

#### Scenario: reconciliation 结果与已验证候选 tree 不一致
- **WHEN** `origin/main^{tree}`不等于current release tree，或main merge commit缺少current reconciliation的父提交关系
- **THEN** Agent MUST停止publication和后续reconciliation并报告expected/actual identities
- **AND** MUST NOT使用`ours`、force push、reset或历史重写掩盖内容差异

#### Scenario: 远端 ref 在衔接前发生竞争更新
- **WHEN** identity检查后、release→main merge或publication前相关remote ref不再指向已检查值，或reconciliation读取到不匹配的current selection/main/release/dev事实
- **THEN** Agent MUST停止尚未执行的mutation、重新fetch并从current release/context事实重新评估
- **AND** Publication已成立时 MUST保持公开事实并在dev来源无法安全证明时报告`published-but-dev-reconciliation-blocked`
- **AND** MUST NOT自动解决冲突、写入dev、force push、删除tag或unpublish

#### Scenario: 发布授权覆盖发布专用历史衔接
- **WHEN** 用户当前轮次明确授权准备或发布对应版本
- **THEN** Buildr Release Skill MAY执行本契约明确的release create/update/freeze、一次性main reconciliation、受保护merge-commit PR、只读dev provenance reconciliation和已授权closeout动作
- **AND** 每个remote mutation或远端release branch删除仍 MUST满足各自current identity与授权门禁
- **AND** 该授权 MUST NOT扩展为通用Git Ops、dev写入、force push、共享历史改写或自动冲突解决
