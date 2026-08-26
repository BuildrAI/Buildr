# Buildr 开源发布治理

## Purpose

定义 Buildr 公开源码、npm package、双语 README、安全候选检查和受控 release workflow 的身份与发布前边界。

## Requirements

### Requirement: 公开产品身份必须一致且无占位符
Buildr MUST 将官方源码仓库声明为 `https://github.com/BuildrAI/Buildr`，将公开 npm package 声明为 `@buildr-ai/buildr`，并 MUST 在公开 metadata、安装命令、反馈入口和 License 中使用已确认身份而非占位符。

#### Scenario: 检查公开候选 metadata
- **WHEN** 维护者运行开源候选检查
- **THEN** repository、homepage 和 bugs MUST 指向 `BuildrAI/Buildr`
- **AND** npm package MUST 使用 `@buildr-ai/buildr` 且 bin MUST 继续暴露 `buildr`
- **AND** License MUST 声明 `Copyright (c) 2025-2026 陈俊`
- **AND** tracked 公开材料 MUST NOT 包含 repository URL 占位符

### Requirement: 公开 README 必须提供中文入口和英文翻译
Buildr MUST 使用根 `README.md` 作为中文产品入口，并 MUST 提供 `README.en.md` 作为 README 的完整英文翻译；其他文档 MUST 继续遵循 Project 管理语言而不要求双语复制。

#### Scenario: 用户从任一 README 开始
- **WHEN** 用户打开中文或英文 README
- **THEN** README MUST 在顶部链接另一语言版本
- **AND** 两份 README MUST 包含一致的 Agent-first 产品定位、问题与价值、工作方式、典型场景、分角色价值、核心模型、快速开始、当前能力与边界和文档导航
- **AND** 两份 README MUST 使用相同的 canonical repository、npm package、CLI 命令和 supported Agent runtime 事实
- **AND** 快速开始 MUST 同时提供 registry package 和开发 checkout 两种 Buildr 来源，并汇合到相同的 runtime discovery 与 init onboarding
- **AND** README MUST 将快速开始的开发 checkout 安装路径与 Buildr 自举 workspace 的仓库结构说明清楚分工，不得在两个章节重复完整 onboarding

### Requirement: 开源候选必须通过可重复安全扫描
Buildr MUST 提供可在本地和 CI 重复运行的开源候选 verifier，扫描 tracked candidate tree 和 npm tarball inventory，并 MUST 对敏感信息、内部来源、占位符、异常大文件或禁止发布路径 fail closed。

#### Scenario: 扫描安全候选
- **WHEN** verifier 检查准备公开的最终候选
- **THEN** verifier MUST 检查常见 secret/private-key 模式、内部 remote/domain、个人绝对路径、公开 URL 占位符和异常大文件
- **AND** verifier MUST 检查 npm tarball 不包含 `.git`、OpenSpec active/archive、task worktree、Agent runtime 或其他非发布资产
- **AND** verifier MUST 仅读取 tracked candidate 和生成的 tarball inventory，不得扫描用户 home、登录态或本机 secrets

#### Scenario: 候选包含被禁止内容
- **WHEN** 任一 tracked 文件或 tarball entry 命中未允许的阻塞规则
- **THEN** verifier MUST 返回非零状态
- **AND** 诊断 MUST 包含规则、相对路径和可执行的修复方向，且 MUST NOT 回显 secret 全文

### Requirement: GitHub Release 必须使用匹配版本的 changelog
Buildr MUST 将根 `CHANGELOG.md` 中与目标 package version 精确匹配的版本章节作为 GitHub Release 的具体发布说明来源，并 MUST 在 npm publish 前完成提取和校验。

#### Scenario: 为目标 tag 生成具体发布说明
- **WHEN** 显式 dispatch 的 release workflow 已解析出目标 package version 与 tag
- **THEN** workflow MUST 从 `CHANGELOG.md` 提取唯一的 `## <version> - <YYYY-MM-DD>` 章节
- **AND** GitHub Release body MUST 包含该章节的具体内容且不得包含相邻版本章节
- **AND** workflow MUST NOT 只使用 GitHub 自动生成的 PR 摘要替代该内容

#### Scenario: 目标版本发布说明无效
- **WHEN** 目标版本章节缺失、重复或没有非空正文
- **THEN** release notes 生成 MUST 返回非零状态并提供可执行诊断
- **AND** workflow MUST 在 tag、registry write 或 npm publish 之前停止
- **AND** workflow MUST NOT 静默回退到自动生成的 Release body

#### Scenario: 创建候选版 GitHub Release
- **WHEN** protected release transaction 已创建或复用匹配 source 的 prerelease tag
- **THEN** workflow MUST 使用预先生成的 notes file
- **AND** workflow MUST 校验远端 tag 已存在且指向目标 source commit
- **AND** GitHub Release MUST 标记为 prerelease 且 MUST NOT 标记为 Latest

#### Scenario: 创建稳定版 GitHub Release
- **WHEN** protected release transaction 已创建或复用匹配 source 的 stable tag
- **THEN** workflow MUST 使用预先生成的 notes file
- **AND** workflow MUST 校验远端 tag 已存在且指向目标 source commit
- **AND** GitHub Release MUST NOT 标记为 prerelease

### Requirement: Release workflow 必须只发布 npm package
Buildr release workflow MUST 只将唯一 `@buildr-ai/buildr` tarball 发布到 npm Registry。Workflow MUST 从显式 dispatch 的 version/tag、source commit、candidate identities、dist-tag 与 release notes 解析唯一 release contract，只执行一次 application payload build 和一次 `npm pack`，并让 smoke、protected release transaction 与 Registry integrity readback 消费同一 tarball bytes。GitHub Release MAY 承载 tag notes metadata，但 MUST NOT 上传 npm tarball、Launcher、SEA、PKG/MSI、platform manifest 或 checksums。

#### Scenario: 可逆验证先于 npm publish
- **WHEN** dispatch workflow 准备正式发布
- **THEN** npm inventory、Host Node CLI/Web、Launcher lifecycle、package identity、integrity 与 release notes checks MUST 在唯一 `npm-production` job请求审批前全部通过
- **AND** 任一失败 MUST 阻止 Environment deployment与不可逆发布

#### Scenario: 发布并回读同一 tarball
- **WHEN** protected release transaction 获得授权
- **THEN** workflow MUST 先完成 current authority probe、最终 pre-tag 校验和匹配 tag ensure，再发布已冻结 tarball并从官方 Registry读取精确 version/integrity后重新安装 smoke
- **AND** MUST NOT重新 pack、切换本地 publish或把 Actions artifact作为公共下载地址

### Requirement: 正式 Buildr bytes 必须只由 npm Registry 承载
Buildr 当前正式产品 bytes MUST 只通过 npm Registry 的 `@buildr-ai/buildr` package 分发。官网、README 与安装说明 MUST 只指向 npm installation；本机 `.app` 或 Start Menu shortcut MUST 由用户显式运行已安装 Buildr 生成，不得作为下载资产、GitHub Release Asset 或第二份 binary 保存。

#### Scenario: 获取正式 Buildr
- **WHEN** 用户查找正式安装方式
- **THEN** 文档 MUST 提供 `npm install -g @buildr-ai/buildr` 与兼容 Node 要求
- **AND** MUST NOT 提供 `.pkg`、`.msi`、SEA 或 Actions artifact 下载链接

#### Scenario: 获取图形入口
- **WHEN** npm 用户需要图形入口
- **THEN** 文档 MUST 指引显式执行 `buildr web launcher install`
- **AND** 生成的本机投射 MUST NOT 上传到 Registry、GitHub Release、官网或另一个 binary store

### Requirement: GitHub Release metadata 必须可恢复且禁止 binary Assets
GitHub Release metadata MUST 继续与 tag、target commit、version、notes 和 prerelease/Latest 语义一致，但当前 release workflow MUST NOT 创建或 ensure 正式 binary Assets。npm Registry 的已发布 version/integrity 是唯一 product-byte recovery authority；同 version 已存在且 integrity 相同时 MUST 复用，漂移时 MUST 停止且不得覆盖。

#### Scenario: 重跑缺少 npm publish 的 tag workflow
- **WHEN** target tag 已存在且解析到相同 source commit，但 npm version 尚不存在
- **THEN** workflow MUST 复用匹配 tag与冻结 tarball并只补齐 npm publish/readback
- **AND** MUST NOT 创建平台 Assets、移动 tag或重建 tarball

#### Scenario: npm version 已存在
- **WHEN** Registry 已存在相同 version
- **THEN** workflow MUST 比较 package、version 与 integrity；完全相同时复用并继续 readback，任何不一致时停止
- **AND** MUST NOT unpublish、覆盖或发布第二份 bytes

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

### Requirement: Release workflow 必须同时回读 GA 与 RC tag
Buildr release workflow MUST 在公开 mutation 前后读取 npm `latest` 与 `next`，校验版本类型、目标 tag推进和非目标 tag不变；单一目标 tag readback MUST NOT作为完整发布收敛证据。

#### Scenario: 发布 RC 只推进 next
- **WHEN** prerelease 版本通过 `next` 发布
- **THEN** 发布后 `next` MUST等于新版本
- **AND** `latest` MUST等于发布前观测值

#### Scenario: 发布 GA 只推进 latest
- **WHEN** 稳定版本通过 `latest` 发布
- **THEN** 发布后 `latest` MUST等于新版本
- **AND** `next` MUST等于发布前观测值

#### Scenario: 目标 tag 类型错误
- **WHEN** RC 发布后的 `next` 不是 prerelease，或 GA 发布后的 `latest` 不是稳定版本
- **THEN** workflow MUST形成可解释的 tag语义诊断并失败
- **AND** 非目标 tag 已存在的类型异常 MUST保持原值并留给 Release Awareness 诊断，不得由本次发布静默修改

#### Scenario: 非目标 tag 漂移
- **WHEN** 发布期间非目标 tag 不同于冻结的发布前值
- **THEN** workflow MUST失败并报告 before/after
- **AND** MUST NOT把该漂移伪装成本次发布的成功副作用

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

### Requirement: Candidate 与 Release 子进程必须共同冻结 exact Node executable 和 PATH
Buildr MUST由一个共享 execution environment helper同时绑定权威 Node executable、对应 bin 的 PATH 首项、npm shim与可审计 Node identity。本地 Candidate、hosted Host Node tuple、release prepare、tarball/Registry smoke、macOS LaunchServices Launcher后代进程和hosted publication helper MUST复用该 contract；任何 consumer MUST NOT只冻结父进程 executable而让子进程从会话 PATH 解析其他 Node。Host Node tuple的权威版本 MUST来自该tuple实际启动verifier的Node，development精确版本只约束development checkout入口。

#### Scenario: inherited PATH 含另一个 Node
- **WHEN** 权威 executable 与 inherited PATH 中首先可见的 Node 版本或路径不同
- **THEN** 父进程 MUST使用权威 executable
- **AND** 所有子进程以及Launcher后代进程执行 `node`/`npm` 时 MUST解析到同一 Node bin
- **AND** evidence MUST输出 executable、version、bin 与 PATH head identity

#### Scenario: hosted current Node 不等于 development exact Node
- **WHEN** Host Node `current` tuple实际Node满足package engine但不等于Project `.node-version`
- **THEN** tuple MUST以实际Node构造exact execution environment并运行同一冻结tarball
- **AND** verifier MUST NOT把development版本声明应用到Host compatibility matrix

#### Scenario: Launcher readiness 失败
- **WHEN** macOS LaunchServices后代没有在专用readiness budget内证明匹配health与Node identity
- **THEN** smoke MUST在清理前保留脱敏instance、launcher log、process observation、elapsed/budget和exact Node audit
- **AND** diagnostic evidence MUST位于既有Candidate diagnostics owner，不得写入旁路store或泄漏instance secret

#### Scenario: Node 或 PATH 漂移
- **WHEN** executable 不是绝对可执行文件、version不满足当前声明、PATH head不匹配或子进程 identity不同
- **THEN** smoke/publish helper MUST在安装、tag或npm publish前 fail closed
- **AND** MUST不依赖硬编码历史复盘中的 Node 版本恢复

### Requirement: Release transaction evidence 必须提供正式关联与可验证 readback
Buildr MUST以 closed release transaction context/evidence schema关联 source release Task、其 retrospective sources、显式 support Tasks、Candidate source SHA/workflow/run、publish workflow/run、main/dev收敛提交、tag、npm version/dist-tag、GitHub Release与Registry smoke。context MUST由Task/Application与GitHub/Git/npm正式读模型形成；terminal evidence MUST保存在既有 release evidence artifact，并 MUST提供按 publish run读取和验证的 portable inspect结果。

#### Scenario: dispatch 正式 release transaction
- **WHEN** 维护者明确授权 publication 且runner准备dispatch唯一 protected workflow
- **THEN** runner MUST在dispatch前验证 release/support Tasks、retrospective source、Candidate run/source、Git bridge与Environment binding
- **AND** workflow input MUST携带 canonical closed context及其 digest
- **AND** Task Record MUST只保留既有顶层/Parent/retrospective事实，不得复制关联正文

#### Scenario: 读取完成的发布链路
- **WHEN** 调用方按 publish run ID执行 release transaction inspect
- **THEN** read model MUST下载同一 run 的正式 evidence artifact并校验 context digest、source/workflow/run/attempt和公共发布事实
- **AND** result MUST同时返回 release/support Tasks、Candidate、publish、bridge、tag、npm/GitHub Release与Registry smoke关联
- **AND** 不匹配、缺失或跨 run evidence MUST fail closed

#### Scenario: transaction 在公共写入前失败
- **WHEN** workflow 在 tag/npm mutation 前失败
- **THEN** evidence MUST保留已确认的 context、Candidate与publish run facts及失败阶段
- **AND** recovery MUST指向同一 transaction run/attempt或明确的新 attempt，不得删除tag、重发旁路 workflow或伪造完成关联

### Requirement: 公开发布必须绑定release集合并分离两次Git收敛
Buildr MUST只对通过完整Product Candidate的current `release-<version>`集合创建一个generation-scoped受保护release→main收敛PR；当该release发生main reconciliation时，PR MUST以当前generation carrier为head并使用merge commit合入，且merge后`main` tree MUST等于冻结release tree并可验证main/release父提交关系。正式Publication成功后 MUST执行post-publication dev provenance reconciliation，证明发布使用的current frozen selection全部源自current `dev`或具有独立可验证的dev回流证据；该动作 MUST为只读、幂等且允许`dev`保留冻结后的新提交，MUST NOT要求published `main`成为`dev`祖先，也 MUST NOT创建merge commit、rebase、reset、force push或修改`dev`。

#### Scenario: release集合进入main
- **WHEN** current release Candidate与唯一tarball通过、main reconciliation evidence完整且维护者授权收敛
- **THEN** Buildr MUST创建或复用一个绑定generation、release HEAD/tree和reconciliation identity的确定性carrier，并只以该carrier创建唯一受保护release→main PR
- **AND** PR MUST以merge commit完成，`origin/main^{tree}` MUST精确等于冻结release tree，且readback MUST证明两个父提交
- **AND** tree不一致、carrier/PR head漂移、合入方式错误或ownership不明 MUST阻止publication

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

#### Scenario: dev策略拒绝merge commit
- **WHEN** current dev branch policy要求线性历史或以其他方式禁止产品将main与dev双亲merge commit普通push到目标ref
- **THEN** convergence owner MUST在push前返回`published-but-dev-convergence-blocked`与策略finding
- **AND** MUST NOT依赖管理员绕过、改写dev历史或把push rejection当作暂态成功

### Requirement: 受保护发布事务必须消费唯一冻结Context
Buildr正式publication MUST只由`.github/workflows/publish.yml`的唯一protected transaction执行。Workflow MUST在一次`npm-production`approval内消费与dispatch完全相同的context digest、matching Candidate aggregate与冻结tarball，依次完成hosted OIDC、final pre-tag convergence、tag ensure、npm publish/dist-tag、GitHub Release与Registry readback。

#### Scenario: 显式授权后dispatch
- **WHEN** 维护者明确授权publication且`dispatch-check`返回frozen ready context
- **THEN** runner MUST只dispatch一次publish workflow并传入context、context digest与Candidate run/artifact identity
- **AND** workflow MUST只有一个job声明`npm-production`、`id-token: write`和tag/npm/GitHub mutation权限

#### Scenario: Hosted pre-tag发现漂移
- **WHEN** protected transaction重新读取的selection、Candidate、artifact、Task correlation、main、workflow或run/attempt identity与冻结context不一致
- **THEN** transaction MUST在tag/npm/GitHub mutation前失败关闭并形成current attempt finding
- **AND** MUST NOT重建context、重新pack、dispatch第二workflow或回退本机凭证

### Requirement: 发布失败必须保留不可逆事实与attempt恢复路径
Protected transaction MUST为current GitHub run/attempt保存逐步evidence，并 MUST从正式Git/npm/GitHub readback记录已经成立的tag、npm version/integrity、dist-tag、GitHub Release与Registry smoke事实。失败Result MUST区分同attempt恢复、明确新attempt恢复和必须新version/人工处理，不得撤销或伪装已成立事实。

#### Scenario: Tag创建后npm失败
- **WHEN** immutable tag已指向冻结source但npm publish或OIDC exchange失败
- **THEN** evidence MUST保留tag commit、失败步骤、run/attempt与安全诊断
- **AND** 恢复 MUST继续消费同一context与tarball并明确是否需要新attempt，MUST NOT删除、移动tag或改用本机token publish

#### Scenario: npm成功后公开readback失败
- **WHEN** Registry已存在同version且integrity匹配冻结tarball，但dist-tag、GitHub Release或Registry smoke尚未完成
- **THEN** rerun MUST复用已发布npm事实并只补齐未成立步骤
- **AND** MUST NOT再次publish、重新pack、unpublish或覆盖相同version

#### Scenario: 已有事实发生冲突
- **WHEN** existing tag source、Registry integrity或GitHub Release metadata与冻结context不一致
- **THEN** transaction MUST返回需要人工处理或新version的blocked恢复分类并保留所有事实
- **AND** MUST NOT自动覆盖、删除、移动或弱化protected environment

### Requirement: Release transaction runner 与 evidence inspect 必须默认返回 compact summary
Release transaction readiness/dispatch 与 hosted evidence inspect MUST缺省返回 `buildr.long-running-operation-summary/v1`。完整 release context、Candidate、publish、tag、npm/GitHub Release与Registry evidence MUST继续由显式 output、hosted evidence artifact或 `--detail full`持有；compact MUST只表达 operation、run/evidence identity、关键步骤、primary failure、artifact/readback状态与唯一 inspect pointer。

#### Scenario: protected transaction成功
- **WHEN** 唯一 hosted publish run已完成且正式 evidence artifact通过readback校验
- **THEN** 默认 dispatch/inspect stdout MUST返回 terminal passed compact summary、publish run与evidence identity
- **AND** MUST不内联完整 context、Task correlation、Candidate或逐步 evidence

#### Scenario: publish仍在运行或调用方等待超时
- **WHEN** GitHub run仍为queued/in_progress或本机等待结束但没有terminal evidence
- **THEN** summary MUST返回 `terminal: false`、`status: running`与同一 publish run inspect pointer
- **AND** MUST不重新dispatch workflow或伪造failed evidence

#### Scenario:正式 evidence失败或超大
- **WHEN** hosted evidence保存terminal failure且完整artifact超过stdout边界
- **THEN** compact inspect MUST返回 terminal failure、primary failed step、recovery class与 `output.truncated`事实
- **AND** explicit full MUST从同一run artifact校验后返回完整 portable evidence

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

### Requirement: 发布编排必须保留独立owner与授权边界
Buildr MUST提供`prepare-dispatch`、`dispatch`与`closeout`三个可恢复release orchestration动作。编排器 MUST只消费既有owner Result并按稳定顺序调用其公开入口，不得建立第二持久化状态权威、接受caller成功布尔值、自动取得publication或cleanup授权，或把跨owner调用宣称为原子事务。

#### Scenario: 无副作用准备dispatch
- **WHEN** 调用方执行`prepare-dispatch`
- **THEN** 编排器 MUST重新读取merge后current owner facts并返回frozen context digest、approval request与`effects: []`
- **AND** MUST NOT dispatch workflow、请求Environment approval、创建tag或执行任何closeout mutation

#### Scenario: 显式授权dispatch
- **WHEN** 调用方对expected current context明确授权publication并执行`dispatch`
- **THEN** 编排器 MUST重验相同context digest后只调用一次既有protected transaction owner
- **AND** context漂移或授权缺失 MUST在workflow dispatch前零远端写入失败

#### Scenario: closeout部分失败后恢复
- **WHEN** hosted evidence、reconciliation、Git closeout、Task completion、Environment cleanup或Doctor中的某一步blocked
- **THEN** 编排器 MUST停止后续未安全步骤并返回全部已成立effects、blocked owner与唯一resume action
- **AND** 重试 MUST复用identity一致的已通过步骤，不得回滚或重放Publication与其他已完成mutation

### Requirement: Release Phase Timeline必须可移植且可验证
Buildr MUST从Task、Git/PR、GitHub run/attempt、release owner Result、Environment与Doctor的current facts生成closed `buildr.release-phase-timeline/v1`。Timeline MUST按稳定顺序表达selection/freeze、Candidate attempts、PR merge、readiness、等待授权、dispatch/approval、Publication、reconciliation与closeout，并为每项保留owner identity、可证明时间边界、status、run/attempt和等待类型；不得保存本机路径、凭证、stdout或估算缺失时间。

#### Scenario: 多次Candidate attempt与成功evidence复用
- **WHEN** 同一release source通过failed-shard retry形成多个run attempt并复用先前成功shard evidence
- **THEN** Timeline MUST按`runId + runAttempt`区分attempt，引用每个成功evidence的原attempt、实际rerun scope与最终aggregate identity
- **AND** MUST NOT把复用evidence记为新执行、把旧generation evidence并入current timeline或只记录最终green run

#### Scenario: 区分执行与等待
- **WHEN** release经历runner执行、GitHub排队、Environment approval与维护者决定
- **THEN** Timeline MUST分别使用`machine-execution`、`platform-queue`、`environment-approval`与`human-decision`分类
- **AND** 缺失开始或结束边界时 MUST记录unknown并省略duration，不得用Task总耗时或Agent估算补齐

#### Scenario: closeout完成
- **WHEN** Publication、reconciliation、Git closeout、Task no-change completion、Environment cleanup与最终Doctor均成立
- **THEN** Timeline MUST返回terminal closed、各owner identity与稳定timeline identity
- **AND** compact output MUST只返回关键阶段、timeline identity与inspect pointer，完整timeline只在显式full中展开
