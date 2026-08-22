## MODIFIED Requirements

### Requirement: Release tag 前必须证明发布权威一致
Buildr MUST在release contract中声明唯一机器可读发布权威元组，至少包含provider、GitHub repository、workflow filename、GitHub Environment与允许的npm action。候选准备阶段 MUST只验证该元组、workflow identity、current `release-<version>`、matching Candidate、唯一tarball、release→main tree与transaction context的静态结构和远端事实，MUST NOT dispatch正式release workflow、请求真实npm token exchange或创建tag。只有维护者明确授权正式发布后，本机 MUST针对同时匹配冻结release tree与current `origin/main`的context dispatch一次完整release workflow；该workflow MUST只有一个使用声明Environment的protected release transaction job，并 MUST在一次审批后以`id-token: write`完成current OIDC token exchange、最终pre-tag convergence、不可移动tag ensure与npm publish。本机maintainer session、`npm trust list`、静态配置或历史provenance MUST NOT替代同一protected transaction内的hosted identity proof。Credential-free evidence MUST绑定release selection、Candidate generation、tarball manifest/integrity、main source、workflow bytes、唯一GitHub run/attempt、目标package与exchange metadata，并 MUST在tag mutation前由同一job消费；任何远端竞争、证据过期或身份漂移 MUST fail closed。

#### Scenario: 候选准备只检查发布结构
- **WHEN** 维护者要求准备候选版但尚未授权正式发布
- **THEN** Buildr MUST完成release selection、release HEAD/tree、Candidate、唯一tarball、release→main tree、branch protection、release contract、Task correlation与workflow structure convergence
- **AND** current `dev`可在release创建后继续前进，readiness MUST NOT要求release自动追随最新`dev`
- **AND** MUST NOT dispatch release workflow、请求`npm-production`审批、执行npm token exchange或创建tag

#### Scenario: 一次审批启动唯一受保护事务
- **WHEN** maintainer明确授权正式发布，且workflow的可逆contract/context/Candidate/Host Node/Launcher jobs全部通过
- **THEN** GitHub MUST只为唯一protected release transaction job创建`npm-production`deployment
- **AND** 该job MUST在同一次approved execution中依次完成hosted OIDC probe、最终pre-tag gate、tag ensure、同一tarball publish与公开readback
- **AND** 其他job MUST NOT声明`npm-production`、`id-token: write`或tag/npm mutation权限

#### Scenario: current 发布权威完全一致
- **WHEN** protected transaction针对匹配release tree的冻结`main`commit、Candidate、tarball和workflow digest成功以OIDC身份完成npm package token exchange
- **THEN** probe MUST形成不包含token、绑定current context、source、workflow、package与同一GitHub run/attempt的hosted evidence
- **AND** pre-tag convergence MUST只在selection、Candidate、artifact、Task correlation、exchange与remote main identities仍current时允许tag ensure
- **AND** workflow MUST在tag创建后继续使用同一冻结tarball完成publish，不dispatch第二个受保护run或重跑完整Product Candidate

#### Scenario: 权威漂移或无法读取
- **WHEN** repository owner、workflow、Environment、allowed action、release HEAD/tree、Candidate generation、tarball integrity、Task correlation、main source、workflow digest、package、run identity或exchange任一不一致或不可用
- **THEN** probe或pre-tag gate MUST返回非零并形成明确blocked finding，包含expected与可安全公开的actual/unavailable原因
- **AND** protected transaction MUST在tag和npm mutation前停止
- **AND** Buildr MUST NOT把本机npm session、`npm trust list`、历史publish provenance、静态测试或人工checklist勾选伪装成current npm控制面验证

#### Scenario: Probe 不产生发布副作用或凭证 artifact
- **WHEN** protected transaction内的authority probe成功或失败
- **THEN** stdout、GitHub output、artifact与最终evidence MUST NOT包含GitHub OIDC ID token或npm exchange token
- **AND** probe成功本身 MUST NOT跳过pre-tag convergence或直接构成tag/publish成功

#### Scenario: Trusted Publishing 认证失败
- **WHEN** hosted authority probe或正式publish因`E401`、`ENEEDAUTH`、OIDC/Trusted Publisher相关`E404`或token exchange拒绝而失败
- **THEN** workflow MUST保留不含凭证的npm原始失败类别、HTTP状态、退出码与已有匹配tag
- **AND** 诊断 MUST输出expected authority元组与修复current authority、rerun同一release transaction的最小恢复路径
- **AND** workflow MUST NOT回退到本机token publish、删除或移动tag、改写npm/GitHub控制面

## ADDED Requirements

### Requirement: 公开发布必须绑定release集合并分离两次Git收敛
Buildr MUST只对通过完整Product Candidate的current `release-<version>`集合创建一个受保护release→main收敛PR；merge后`main` tree MUST等于冻结release tree。正式Publication成功后才可执行main→dev收敛；该动作 MUST保留publication期间已经进入`dev`的新内容，并 MUST拒绝`ours`、reset、force push或静默冲突解决。

#### Scenario: release集合进入main
- **WHEN** current release Candidate与唯一tarball通过且维护者授权收敛
- **THEN** Buildr MUST只创建一个绑定该release HEAD/tree的受保护release→main PR
- **AND** squash或其他允许策略产生的main commit identity可以不同，但`origin/main^{tree}` MUST精确等于冻结release tree
- **AND** tree不一致或PR head漂移 MUST阻止publication

#### Scenario: 发布成功后dev已经前进
- **WHEN** tag、npm、dist-tag、GitHub Release和Registry smoke已成立，且`dev`包含release创建后交付的新内容
- **THEN** main→dev收敛 MUST保留这些新内容并证明release publication内容已进入current dev
- **AND** 发生冲突或identity不可证明时 MUST报告`published-but-dev-convergence-blocked`并保留公开发布事实
- **AND** MUST NOT删除tag、unpublish、force push或用`ours`掩盖内容差异
