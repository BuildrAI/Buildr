## MODIFIED Requirements

### Requirement: 公开发布必须绑定release集合并分离两次Git收敛
以下旧 `release-<version>`、完整产品候选（Product Candidate）和主包发布后事实 SHALL 保留为已选择主包的原要求。通用源码选择 SHALL 以 `selectionId` 固定目标及各版本，最终准确源码按实际差异消费适用主包和／或插件（Plugin）证明，再沿同一受保护载体（Carrier）纳入 `main`；主包或网页变化 MUST 保持完整主包检查，仅插件（Plugin）证明 MUST NOT 冒充主包完整证明。未选择主包时源码纳入 MUST NOT 检查主包版本未公开或要求主包发布上下文（Context），后续只使用已选择逐包事实核验开发来源。受保护合入、树一致、双亲回读和冲突边界对三种选择同样适用。

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

### Requirement: 受保护发布事务必须消费唯一冻结Context
本条唯一 `.github/workflows/publish.yml`、标签（Tag）及主包上下文（Context）义务仅适用于已选择主包。插件（Plugin）公开发布 SHALL 继续由 `.github/workflows/publish-dsh-plugin.yml` 独立拥有，两种选择 MUST NOT 串用身份；联合编排只传递各包既有冻结事实和运行指针，MUST NOT 合并权限或生成第二发布所有者（Owner）。

Buildr正式publication MUST只由`.github/workflows/publish.yml`的唯一protected transaction执行。Workflow MUST在一次`npm-production`approval内消费与dispatch完全相同的context digest、matching Candidate aggregate与冻结tarball，依次完成hosted OIDC、final pre-tag convergence、tag ensure、npm publish/dist-tag、GitHub Release与Registry readback。

#### Scenario: 显式授权后dispatch
- **WHEN** 维护者明确授权publication且`dispatch-check`返回frozen ready context
- **THEN** runner MUST只dispatch一次publish workflow并传入context、context digest与Candidate run/artifact identity
- **AND** workflow MUST只有一个job声明`npm-production`、`id-token: write`和tag/npm/GitHub mutation权限

#### Scenario: Hosted pre-tag发现漂移
- **WHEN** protected transaction重新读取的selection、Candidate、artifact、Task correlation、main、workflow或run/attempt identity与冻结context不一致
- **THEN** transaction MUST在tag/npm/GitHub mutation前失败关闭并形成current attempt finding
- **AND** MUST NOT重建context、重新pack、dispatch第二workflow或回退本机凭证

### Requirement: 发布完成必须以零中间资源和正式release ref核验为边界
以下主包公开标签（Tag）保全条件只用于主包发布收尾。仅插件（Plugin）选择 SHALL 依据自身公开原字节及受保护源码历史保全；联合共享资源 MUST 等全部已选择发布事实成立且活动用途结束才可清理。纯源码交付 SHALL 按明确用途结束，不要求未选择主包的公开事实。任何实际删除仍须证明归属、实时提交（Commit）、保全与对应授权。


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

## ADDED Requirements

### Requirement: 发布准备必须按实际变化消费各包证明
发布准备 SHALL 明确选择仅主包、仅插件（Plugin）或联合。源码进入 `main` 的门禁（Gate）MUST 绑定准确源码、已观察 `main` 与最终冻结源码的完整树差异及适用的候选（Candidate）证据；差异 MUST 包含基线（Baseline）自带变化、共享构建／检查配方和主包生成输入，MUST NOT 仅比较最后选入提交（Commit）。涉及主包或网页产物（Artifact）的变化 MUST 保持完整主包检查；仅插件（Plugin）变化 SHALL 使用独立完整检查，MUST NOT 把主包绿色结果冒充插件（Plugin）已验证。调用方的目标输入 MUST NOT 绕过实际主包变化要求。

#### Scenario: 插件选择混入主包运行实现
- **WHEN** 输入仅选择插件（Plugin），实际差异包含主包或网页产物（Artifact）实现
- **THEN** 源码纳入 MUST 同时要求相应完整主包检查

#### Scenario: 独立插件源码证明
- **WHEN** 源码只改变插件（Plugin）及对应发布工具，并通过独立完整检查
- **THEN** 系统 SHALL 保存绑定准确源码与检查配方的插件（Plugin）证明
- **AND** 该证明 MUST NOT 冒充合入后 `main` 上可公开发布的候选（Candidate）

### Requirement: 联合发布必须保留逐包事实并局部恢复
两个包 SHALL 继续由各自受保护工作流（Workflow）及确切版本授权发布原候选（Candidate）字节。联合发布 MUST NOT 承诺跨包原子性。公开成功、失败与请求未知 SHALL 分别保存；恢复 MUST 核对同版本原字节，已成功包只回读，未知请求只查询，不得自动重复发送。

#### Scenario: 主包已公开而插件失败
- **WHEN** 联合发布已证明主包公开，插件（Plugin）尚未成功
- **THEN** 系统 MUST 保留主包事实并只恢复插件（Plugin）未完成事项
- **AND** MUST NOT 重发、撤销主包或重新打包

#### Scenario: 插件请求响应丢失
- **WHEN** 插件（Plugin）可能已进入公开写入但结果未知
- **THEN** 恢复 MUST 使用原请求及候选（Candidate）身份回读
- **AND** 没有明确未发生写入证据之前 MUST NOT 再次派发
