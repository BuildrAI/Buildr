## MODIFIED Requirements

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
Buildr Product Project的发布引导 MUST先把通过完整Candidate的current release tree经唯一受保护release→main PR收敛到`main`，允许squash造成commit identity变化但要求tree完全一致；正式Publication成功后，再以current frozen selection和remote Git facts核验全部发布内容的dev provenance。两次动作 MUST分别核验identity和授权，且post-publication reconciliation MUST只读、允许`dev`保留release冻结后的新内容并保持线性历史。

#### Scenario: Finish 后先完成 self-bootstrap activation
- **WHEN** 一个被release选择的release/support Task已经通过Finish交付，且其Workspace contribution适用self-bootstrap
- **THEN** Agent MUST在冻结release Candidate与构造transaction correlation前取得matching runner的`passed`或带完整plan的`not-applicable`结果
- **AND** correlation MUST核验Task、Finish run、delivered ref、plan、status和result identity
- **AND** runner blocked、failed或identity不匹配 MUST只阻塞消费该Activation的后续动作，不得改写已成立Delivery

#### Scenario: squash 后候选 tree 完全一致
- **WHEN** release→main PR已按仓库策略squash merge
- **AND** `origin/main^{tree}`与冻结release tree identity相同
- **THEN** Agent MUST把main source记录为matching publication input
- **AND** MUST NOT仅因main与release commit identity不同而重复完整Candidate或重建tarball

#### Scenario: self-bootstrap evidence 缺失或不匹配
- **WHEN** release correlation需要的self-bootstrap result缺失，或schema、Task、Finish run、delivered ref、plan、status与current facts不匹配
- **THEN** readiness MUST在Candidate/publication实际消费该事实前失败关闭并报告matching owner恢复方向
- **AND** MUST NOT从聊天、临时stdout、近似Git ancestry或caller摘要推断Activation完成

#### Scenario: main 已是 dev 祖先
- **WHEN** Publication成功后current frozen selection identity与transaction一致，且baseline和全部`sourceDevCommit`均由current remote `dev`包含
- **THEN** Agent MUST将post-publication reconciliation视为幂等完成并保留current dev HEAD
- **AND** MUST NOT要求published main成为dev祖先、创建merge commit、重复Candidate或重新publish

#### Scenario: squash 结果与已验证候选 tree 不一致
- **WHEN** `origin/main^{tree}`不等于冻结release tree
- **THEN** Agent MUST停止publication和后续reconciliation并报告expected/actual identities
- **AND** MUST NOT使用`ours`、force push、reset或历史重写掩盖内容差异

#### Scenario: 远端 ref 在衔接前发生竞争更新
- **WHEN** identity检查后、release→main merge或publication前相关remote ref不再指向已检查值，或reconciliation读取到不匹配的current selection/main/release/dev事实
- **THEN** Agent MUST停止尚未执行的mutation、重新fetch并从current release/context事实重新评估
- **AND** Publication已成立时 MUST保持公开事实并在dev来源无法安全证明时报告`published-but-dev-reconciliation-blocked`
- **AND** MUST NOT自动解决冲突、写入dev、force push、删除tag或unpublish

#### Scenario: 发布授权覆盖发布专用历史衔接
- **WHEN** 用户当前轮次明确授权准备或发布对应版本
- **THEN** Buildr Release Skill MAY执行本契约明确的release create/update/freeze、受保护PR、只读dev provenance reconciliation和已授权closeout动作
- **AND** 每个remote mutation或远端release branch删除仍 MUST满足各自current identity与授权门禁
- **AND** 该授权 MUST NOT扩展为通用Git Ops、dev写入、force push、共享历史改写或自动冲突解决

### Requirement: 候选版准备Task必须覆盖完整准备结果并与support交付分离
Buildr Release workflow MUST让唯一`release-<version>` Task表达维护者要求的完整发布生命周期，并将需要在Candidate前独立完成Development、Verification与Finish的版本材料、测试修复或owner修复建模为窄release support Task。协调Task MUST从selection持续保持active到Publication、post-publication dev provenance reconciliation与必需closeout完成；support Task terminal、Task Finish delivery、self-bootstrap activation、单次Candidate运行或readiness通过 MUST NOT单独使release Task completed。

#### Scenario: release材料需要在Candidate前交付
- **WHEN** package version、CHANGELOG、README、测试修复或release owner修复必须进入当前release集合
- **THEN** Agent MUST在基于current `dev`的独立support Task worktree完成该内容自己的Development、Verification、Finish与适用self-bootstrap
- **AND** delivered dev commit MUST再以`cherry-pick -x`选择到既有release集合；Agent MUST NOT直接在release worktree修复后把整条release历史合并回dev

#### Scenario: Candidate失败
- **WHEN** current release source的完整Candidate aggregate失败、缺失或与selection identity不匹配
- **THEN** release Task MUST保持active或blocked并报告失败run/source和同一Task恢复动作
- **AND** Agent MUST NOT调用release Task Finish/complete、把support delivery当成发布完成或创建第二个同version协调Task

#### Scenario: 候选版准备达到授权终点
- **WHEN** current release selection已冻结、完整Candidate aggregate通过、唯一tarball成立、release→main tree相等且dispatch-check readiness以`effects: []`通过
- **THEN** release workflow MUST保持同一协调Task active并报告等待current frozen context的publication授权
- **AND** Task状态、Candidate通过或历史授权 MUST NOT替代维护者本次明确授权

#### Scenario: publication和必需closeout完成
- **WHEN** protected transaction、正式readback、matching dev provenance reconciliation与全部必需local/intermediate closeout成立，且正式远端release ref已按默认保留策略核验
- **THEN** Agent MAY以no-change完成唯一`release-<version>`协调Task并报告完整发布与closeout事实
- **AND** 可选正式远端release ref删除未授权 MUST NOT要求第二协调Task

#### Scenario: 历史release Task被提前完成
- **WHEN** 旧版本在本Requirement生效前已有错误terminal协调Task
- **THEN** Agent MUST保留历史记录，不得改写SQLite、伪造Task reopening或把旧事实迁移为current
- **AND** 新的唯一Task约束 MUST适用于后续version，产品不得继续把resume、refresh或finalize作为正常恢复模型

### Requirement: Buildr Release Skill必须消费current lifecycle与closeout结果
`buildr-release` MUST按release lifecycle read model恢复同一version和Task，只在阶段需要时调用selection、Candidate、readiness、protected transaction、Git reconciliation与closeout owner。Skill MUST报告Publication与后续维护的正交状态，并 MUST NOT通过聊天摘要、Task标题或新建协调Task补造阶段。

#### Scenario: 等待授权后继续发布
- **WHEN** lifecycle为`awaiting-publication-authorization`且维护者明确授权matching context
- **THEN** Skill MUST以同一Task、generation与context dispatch protected transaction并继续跟踪后续阶段
- **AND** MUST NOT创建finalize Task、重新pack或沿用其他context授权

#### Scenario: main→dev或closeout受阻
- **WHEN** Publication已成立但dev provenance reconciliation或必需closeout返回blocked及recovery identity
- **THEN** Skill MUST保留同一active Task并从该identity恢复对应owner
- **AND** MUST NOT撤销Publication、写入dev、重跑已通过Candidate或创建resume Task
