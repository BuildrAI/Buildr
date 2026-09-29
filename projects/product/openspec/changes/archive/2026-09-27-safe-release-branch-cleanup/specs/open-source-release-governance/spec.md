## MODIFIED Requirements

### Requirement: 公开发布必须绑定release集合并分离两次Git收敛
Buildr MUST在完整Product Candidate前，对current `release-<version>` frozen selection完成current main coverage检查与保持release tree不变的历史收敛，并把该post-reconciliation generation作为唯一final source。Buildr MUST只对通过完整Product Candidate的final generation创建一个generation-scoped受保护release→main收敛PR；PR MUST以current generation carrier为head并使用merge commit合入，且merge后`main` tree MUST等于Candidate绑定的frozen release tree并可验证main/release父提交关系。正式Publication成功后 MUST执行post-publication dev provenance reconciliation，证明发布使用的current frozen selection全部源自current `dev`或具有独立可验证的dev回流证据；该动作 MUST为只读、幂等且允许`dev`保留冻结后的新提交，MUST NOT要求published `main`成为`dev`祖先，也 MUST NOT创建merge commit、rebase、reset、force push或修改`dev`。

#### Scenario: final release source进入Candidate
- **WHEN** current selection已freeze、main coverage与历史收敛evidence完整、matching release Environment current
- **THEN** Buildr MUST先固定post-reconciliation commit/tree/generation，再运行一次完整Product Candidate并形成唯一tarball
- **AND** Candidate运行后 MUST NOT再把main内容merge进release或改变final source

#### Scenario: release集合进入main
- **WHEN** final generation的current release Candidate与唯一tarball通过、main reconciliation evidence完整且维护者授权收敛
- **THEN** Buildr MUST创建或复用一个绑定generation、release HEAD/tree和reconciliation identity的确定性carrier，并只以该carrier创建唯一受保护release→main PR
- **AND** PR MUST以merge commit完成，`origin/main^{tree}` MUST精确等于Candidate绑定的frozen release tree，且readback MUST证明两个父提交
- **AND** tree不一致、main parent漂移、carrier/PR head漂移、合入方式错误或ownership不明 MUST阻止publication

#### Scenario: main在Candidate后前进
- **WHEN** current `origin/main`前进且必须改变final release source
- **THEN** Buildr MUST使Candidate、artifact、carrier与readiness stale，并先形成新的coverage/reconciliation generation
- **AND** MUST对新final source重新运行完整Candidate，MUST NOT把main反向merge进已验证release或复用旧tarball

#### Scenario: 发布成功后dev已经前进
- **WHEN** tag、npm、dist-tag、GitHub Release和Registry smoke已成立，且`dev`包含release冻结后交付的新内容
- **THEN** reconciliation MUST核验Publication context、current frozen selection、published main commit/tree有效且current main包含该发布提交；正式release ref存在时必须匹配，缺失时必须证明官方远端Tag匹配published main且冻结源码位于该提交历史中
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

#### Scenario: dev策略禁止双亲merge commit普通push
- **WHEN** current dev branch policy要求线性历史或以其他方式禁止产品将main与dev双亲merge commit普通push到目标ref
- **THEN** convergence owner MUST执行只读来源核验并保留dev当前历史
- **AND** MUST NOT依赖管理员绕过、改写dev历史或把push rejection当作暂态成功

### Requirement: 发布完成必须以零中间资源和正式release ref核验为边界

Publication和dev provenance已成立后，Release closeout MUST从canonical Workspace即时解析retained controller，完成release Task后直接调用Worktree provider cleanup，再运行Doctor。Worktree或Doctor cleanup失败 MUST保留已成立的Publication、Task结果和Git convergence事实。

#### Scenario: 按本轮授权清理正式远端release branch
- **WHEN** Publication、matching dev provenance reconciliation已成立且正式远端release branch精确等于冻结release commit
- **THEN** closeout MUST按本轮匹配的清理授权处理：新政策先核验官方远端Tag、冻结源码在发布提交历史内且当前main保有该发布提交，再条件删除正式ref并记录`cleaned-and-verified`；旧授权缺少该政策时记录`retained-and-verified`
- **AND** closeout MUST完成Task、直接调用Worktree cleanup与Doctor，并保留官方远端Tag、GitHub Release和npm产物
- **AND** 工具升级或历史resume MUST NOT自动扩大旧publication授权；分支已不存在且保全证据通过时 MUST可继续恢复

#### Scenario: 默认保留正式远端release branch
- **WHEN** 历史发布授权未包含本轮分支清理政策且正式远端release branch精确匹配冻结源码
- **THEN** closeout MUST按历史政策记录`retained-and-verified`并继续其余收尾
- **AND** MUST NOT仅因工具升级或resume自动取得删除授权

#### Scenario: 中间资源漂移
- **WHEN** 任一generation carrier、worktree或local lifecycle ref的ownership、dirty状态或expected identity无法证明
- **THEN** closeout MUST返回blocked资源清单并保留已成立Publication、Task completion、reconciliation与其他已清理事实
- **AND** MUST NOT删除未知branch、worktree、未授权正式release ref或其他version资源
