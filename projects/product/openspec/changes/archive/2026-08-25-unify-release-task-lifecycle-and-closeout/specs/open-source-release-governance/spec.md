## MODIFIED Requirements

### Requirement: Publication 必须从已完成 Task 的权威环境事实重建
Buildr release preparation MUST消费matching active release Task Environment Plan/Receipt中已验证的Service preparation declaration、recipe、inputs与identity。等待授权期间Environment MAY保持ready或由owner清理可释放资源；后续publication MUST从冻结commit、已保存Environment facts和同一权威recipe重建clean hosted environment，并 MUST NOT要求提前完成release Task、恢复旧worktree或在Product根及其他未声明cwd另行运行依赖准备。

#### Scenario: Release Task Finish 已清理 worktree
- **WHEN** active release Task已形成current frozen readiness context且publication得到明确授权，无论原execution worktree仍ready或已由owner清理可释放资源
- **THEN** release runner MUST验证plan identity、`service:product/buildr` recipe、Service lockfile inputs、source commit与同一active Task identity
- **AND** workflow MUST在冻结Buildr Service root按同一recipe语义重建依赖
- **AND** MUST NOT完成或重开Task、恢复旧worktree或在`projects/product`执行`npm ci`

#### Scenario: recipe、cwd 或 lockfile 不匹配
- **WHEN** Environment Receipt缺少required recipe、冻结source缺少Service lockfile、cwd不是声明的Service root或input identity漂移
- **THEN** release preparation MUST在dispatch或npm mutation前确定性失败
- **AND** diagnostic MUST指出expected selector、recipe、cwd、input与actual fact

### Requirement: 公开发布必须绑定release集合并分离两次Git收敛
Buildr MUST只对通过完整Product Candidate的current `release-<version>`集合创建一个generation-scoped受保护release→main收敛PR；merge后`main` tree MUST等于冻结release tree。正式Publication成功后才可执行main→dev收敛；该动作 MUST保留publication期间已经进入`dev`的新内容，以确定性recovery identity报告冲突或remote race，并 MUST在push前证明目标branch policy允许产品拥有的merge commit，拒绝依赖管理员绕过、`ours`、reset、force push或静默冲突解决。

#### Scenario: release集合进入main
- **WHEN** current release Candidate与唯一tarball通过且维护者授权收敛
- **THEN** Buildr MUST创建或复用一个绑定generation与release HEAD/tree的确定性carrier，并只以该carrier创建唯一受保护release→main PR
- **AND** squash或其他允许策略产生的main commit identity可以不同，但`origin/main^{tree}` MUST精确等于冻结release tree
- **AND** tree不一致、carrier/PR head漂移或ownership不明 MUST阻止publication

#### Scenario: 发布成功后dev已经前进
- **WHEN** tag、npm、dist-tag、GitHub Release和Registry smoke已成立，且`dev`包含release创建后交付的新内容
- **THEN** main→dev收敛 MUST保留这些新内容并证明release publication内容已进入current dev
- **AND** 发生冲突、remote race或identity不可证明时 MUST返回`published-but-dev-convergence-blocked`与同一recovery identity并保留公开发布事实
- **AND** MUST NOT删除tag、unpublish、force push或用`ours`掩盖内容差异

#### Scenario: dev策略拒绝merge commit
- **WHEN** current dev branch policy要求线性历史或以其他方式禁止产品将main与dev双亲merge commit普通push到目标ref
- **THEN** convergence owner MUST在push前返回`published-but-dev-convergence-blocked`与策略finding
- **AND** MUST NOT依赖管理员绕过、改写dev历史或把push rejection当作暂态成功

## ADDED Requirements

### Requirement: 发布完成必须以零中间资源和正式release ref核验为边界
Buildr MUST在Publication成功后执行幂等closeout，并 MUST把正式远端`release-<version>`作为默认保留的发布事实，把generation carrier、临时convergence worktree、本地release branch、selection lifecycle refs与owned release worktree作为必需清理资源。可选删除正式远端release ref MUST继续要求独立明确授权，但 MUST NOT成为唯一release Task完成门禁。

#### Scenario: 默认保留正式远端release branch
- **WHEN** publication与main→dev已成立且正式远端release branch精确等于冻结release commit
- **THEN** closeout MUST记录该正式ref为`retained-and-verified`并清理全部matching中间资源
- **AND** 未请求正式ref删除 MUST NOT产生blocked或要求新的协调Task

#### Scenario: 中间资源漂移
- **WHEN** 任一generation carrier、worktree或local lifecycle ref的ownership或expected identity无法证明
- **THEN** closeout MUST返回blocked资源清单并保留已成立Publication与其他已清理事实
- **AND** MUST NOT删除未知branch、worktree、正式release ref或其他version资源
