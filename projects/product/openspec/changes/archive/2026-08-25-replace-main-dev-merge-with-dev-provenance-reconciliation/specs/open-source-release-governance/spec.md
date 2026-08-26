## MODIFIED Requirements

### Requirement: 公开发布必须绑定release集合并分离两次Git收敛
Buildr MUST只对通过完整Product Candidate的current `release-<version>`集合创建一个generation-scoped受保护release→main收敛PR；merge后`main` tree MUST等于冻结release tree。正式Publication成功后 MUST执行post-publication dev provenance reconciliation，证明发布使用的current frozen selection全部源自current `dev`或具有独立可验证的dev回流证据；该动作 MUST为只读、幂等且允许`dev`保留冻结后的新提交，MUST NOT要求published `main`成为`dev`祖先，也 MUST NOT创建merge commit、rebase、reset、force push或修改`dev`。

#### Scenario: release集合进入main
- **WHEN** current release Candidate与唯一tarball通过且维护者授权收敛
- **THEN** Buildr MUST创建或复用一个绑定generation与release HEAD/tree的确定性carrier，并只以该carrier创建唯一受保护release→main PR
- **AND** squash或其他允许策略产生的main commit identity可以不同，但`origin/main^{tree}` MUST精确等于冻结release tree
- **AND** tree不一致、carrier/PR head漂移或ownership不明 MUST阻止publication

#### Scenario: 发布成功后dev已经前进
- **WHEN** tag、npm、dist-tag、GitHub Release和Registry smoke已成立，且`dev`包含release冻结后交付的新内容
- **THEN** reconciliation MUST核验Publication context、current frozen selection、正式release ref、published main commit/tree与current remote refs一致
- **AND** MUST证明selection baseline与每个ordered `sourceDevCommit`均由current `dev`包含，同时保留`dev`当前HEAD与后续内容
- **AND** MUST NOT要求main成为dev祖先、比较dev与release tree相等或产生任何Git写入effect

#### Scenario: release内容缺少dev来源
- **WHEN** current selection包含无法重建合法`sourceDevCommit`的entry，或baseline/source不再由current remote `dev`证明
- **THEN** reconciliation owner MUST返回`published-but-dev-reconciliation-blocked`与稳定recovery identity并保留Publication事实
- **AND** MUST要求先由独立support Task把内容交付到`dev`并形成可验证来源，MUST NOT接受元数据标签、聊天摘要、管理员绕过或直接release编辑作为成功证据

#### Scenario: dev策略拒绝merge commit
- **WHEN** current dev branch policy要求线性历史并禁止普通merge commit
- **THEN** reconciliation MUST把该策略视为与只读核验兼容，不得将其报告为发布阻塞
- **AND** owner MUST以空`effects`完成核验，MUST NOT创建临时merge worktree、commit或push

### Requirement: 发布完成必须以零中间资源和正式release ref核验为边界
Buildr MUST在Publication成功且post-publication dev provenance reconciliation通过后执行幂等closeout，并 MUST把正式远端`release-<version>`作为默认保留的发布事实，把generation carrier、临时convergence worktree、本地release branch、selection lifecycle refs与owned release worktree作为必需清理资源。可选删除正式远端release ref MUST继续要求独立明确授权，但 MUST NOT成为唯一release Task完成门禁。

#### Scenario: 默认保留正式远端release branch
- **WHEN** Publication、matching dev provenance reconciliation已成立且正式远端release branch精确等于冻结release commit
- **THEN** closeout MUST记录该正式ref为`retained-and-verified`并清理全部matching中间资源
- **AND** 未请求正式ref删除 MUST NOT产生blocked或要求新的协调Task

#### Scenario: 中间资源漂移
- **WHEN** 任一generation carrier、worktree或local lifecycle ref的ownership或expected identity无法证明
- **THEN** closeout MUST返回blocked资源清单并保留已成立Publication、reconciliation与其他已清理事实
- **AND** MUST NOT删除未知branch、worktree、正式release ref或其他version资源
