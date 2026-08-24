## MODIFIED Requirements

### Requirement: Buildr 发布准备使用版本化任务环境
Buildr Product Project的发布引导 MUST从目标package version派生唯一release Task identity，并通过该Task的ready Environment在独立execution root准备Buildr Service lockfile依赖。Release集合 MUST从维护者指定的精确`dev` baseline创建，Task checkout与`release-<version>` carrier的角色 MUST明确分离；依赖、版本材料、selection、Candidate与public publication不得从调用方自选cwd、旧worktree或会话PATH派生。

#### Scenario: 创建发布任务分支和 worktree
- **WHEN** Agent为目标版本`<version>`准备Buildr候选版或稳定版
- **THEN** release Task id MUST为`release-<version>`，`<version>` MUST是不带`v`前缀的完整package version
- **AND** Task Environment MUST创建或复用该Task唯一checkout，并绑定权威Node、Workspace CLI与Plan/Receipt
- **AND** release owner MUST从维护者指定且可由current `dev`证明的精确baseline创建唯一`release-<version>`集合
- **AND** Task worktree branch、release carrier ref和最终remote release branch MUST由read model分别表达，不得仅因同名而互相替代

#### Scenario: 新发布 worktree 先准备依赖
- **WHEN** release Task需要修改版本材料、运行本地验证或调用release工具
- **THEN** Task Environment MUST只接受ready的`service:product/buildr/buildr.npm-ci` recipe
- **AND** recipe cwd MUST为`projects/product/services/buildr`，package、Service lockfile、declaration、Plan、recipe与exact Node identity MUST匹配
- **AND** 依赖准备失败或identity漂移时 Agent MUST停止受管发布动作
- **AND** Agent MUST NOT在Product根运行`npm ci`或从会话PATH猜Node

#### Scenario: 继续已有版本的发布任务
- **WHEN** `release-<version>` Task、Environment或release集合已经存在
- **THEN** Agent MUST通过Task/Environment/release owner read model分别核验并复用matching identity
- **AND** source baseline、selection chain、version、branch ownership或Environment identity不匹配时 MUST停止并报告唯一恢复方向
- **AND** Agent MUST NOT为同一版本创建第二Task、第二release集合或第二Candidate source

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
Buildr Product Project的发布引导 MUST先把通过完整Candidate的current release tree经唯一受保护release→main PR收敛到`main`，允许squash造成commit identity变化但要求tree完全一致；正式Publication成功后，再以current Git facts将`main`内容安全收敛回`dev`。两次收敛 MUST分别核验identity和授权，并 MUST保留release创建后已经进入`dev`的新内容。

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
- **WHEN** Publication成功后准备main→dev收敛，且current `origin/main`已经是`origin/dev`祖先并能证明published content已包含
- **THEN** Agent MUST将收敛视为幂等完成
- **AND** MUST NOT创建无意义merge commit、重复Candidate或重新publish

#### Scenario: squash 结果与已验证候选 tree 不一致
- **WHEN** `origin/main^{tree}`不等于冻结release tree
- **THEN** Agent MUST停止publication、push和后续收敛并报告expected/actual identities
- **AND** MUST NOT使用`ours`、force push、reset或历史重写掩盖内容差异

#### Scenario: 远端 ref 在衔接前发生竞争更新
- **WHEN** identity检查后、release→main merge、publication或main→dev push前任一相关remote ref不再指向已检查值
- **THEN** Agent MUST停止尚未执行的mutation、重新fetch并从current release/context事实重新评估
- **AND** Publication已成立时 MUST保持公开事实并在main→dev无法安全继续时报告`published-but-dev-convergence-blocked`
- **AND** MUST NOT自动解决冲突、force push、删除tag或unpublish

#### Scenario: 发布授权覆盖发布专用历史衔接
- **WHEN** 用户当前轮次明确授权准备或发布对应版本
- **THEN** Buildr Release Skill MAY执行本契约明确的release create/update/freeze、受保护PR和已授权收敛动作
- **AND** 每个remote mutation或远端release branch删除仍 MUST满足各自current identity与授权门禁
- **AND** 该授权 MUST NOT扩展为通用Git Ops、force push、共享历史改写或自动冲突解决

## ADDED Requirements

### Requirement: Agent必须按release身份链消费专业provider
Agent MUST按release selection、Task/Environment/Development/Finish/self-bootstrap、Product Candidate、release readiness、protected transaction和Git convergence的owner顺序消费current结果。任一provider暂不可用只阻塞实际消费该事实的受管动作，不得阻止安全只读调查或通过另一个owner补造成功。

#### Scenario: P1实现Child并行开发
- **WHEN** 发布集合契约Child形成current Contribution Handoff
- **THEN** selection/provenance、Candidate/artifact与Task correlation三个Child MAY按Parent依赖图并行开发
- **AND** 每个Child MUST只修改自身owner范围、形成独立Candidate/evidence/handoff并禁止写入其他模块store
