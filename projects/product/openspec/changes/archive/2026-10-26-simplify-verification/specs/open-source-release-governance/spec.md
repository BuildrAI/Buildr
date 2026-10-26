## MODIFIED Requirements

### Requirement: Release workflow 必须只发布 npm package
Buildr release workflow MUST 只将唯一 `@buildr-ai/buildr` tarball 发布到 npm Registry。Workflow MUST 从显式 dispatch 的 version/tag、source commit、candidate identities、dist-tag 与 release notes 解析唯一 release contract，消费候选阶段唯一一次 application payload build 和 `npm pack`的结果，正式发布不得构建，并让 端到端检查（E2E）、protected release transaction 与 Registry integrity readback 消费同一 tarball bytes。GitHub Release MAY 承载 tag notes metadata，但 MUST NOT 上传 npm tarball、Launcher、SEA、PKG/MSI、platform manifest 或 checksums。

#### Scenario: 可逆验证先于 npm publish
- **WHEN** dispatch workflow 准备正式发布
- **THEN** npm inventory、Host Node CLI/Web、真实平台Launcher lifecycle、package identity、integrity 与 release notes checks MUST在完整候选中通过，发布消费matching证据并在唯一 `npm-production` job请求审批前复核相关身份
- **AND** 任一失败 MUST 阻止 Environment deployment与不可逆发布

#### Scenario: 发布并回读同一 tarball
- **WHEN** protected release transaction 获得授权
- **THEN** workflow MUST 先完成 current authority probe、最终 pre-tag 校验和匹配 tag ensure，再发布已冻结 tarball并从官方 Registry读取精确 version/integrity后重新安装 端到端检查（E2E）
- **AND** MUST NOT重新 pack、切换本地 publish或把 Actions artifact作为公共下载地址

### Requirement: Candidate 与 Release 子进程必须共同冻结 exact Node executable 和 PATH
Buildr MUST由一个共享 execution environment helper同时绑定权威 Node executable、对应 bin 的 PATH 首项、npm shim与可审计 Node identity。本地 Candidate、hosted Host Node tuple、release prepare、tarball/Registry 原包端到端检查（E2E）、macOS LaunchServices Launcher后代进程和hosted publication helper MUST复用该 contract；任何 consumer MUST NOT只冻结父进程 executable而让子进程从会话 PATH 解析其他 Node。Host Node tuple的权威版本 MUST来自该tuple实际启动verifier的Node，开发、验证与发布入口 MUST接受满足 Product 最低版本要求的稳定 Node，MUST NOT因实际版本不等于基准或主版本更高而拒绝；同一次执行内的真实 Node identity继续严格一致。

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
- **THEN** 端到端检查（E2E） MUST在清理前保留脱敏instance、launcher log、process observation、elapsed/budget和exact Node audit
- **AND** diagnostic evidence MUST位于既有Candidate diagnostics owner，不得写入旁路store或泄漏instance secret

#### Scenario: Node 或 PATH 漂移
- **WHEN** executable 不是绝对可执行文件、version不满足当前声明、PATH head不匹配或子进程 identity不同
- **THEN** 端到端检查（E2E）/publish helper MUST在安装、tag或npm publish前 fail closed
- **AND** MUST不依赖硬编码历史复盘中的 Node 版本恢复

### Requirement: Release transaction evidence 必须提供正式关联与可验证 readback
Buildr MUST以closed release transaction context/evidence schema关联source release Task、显式support Tasks、Candidate source SHA/workflow/run、publish workflow/run、main/dev收敛提交、tag、npm version/dist-tag、GitHub Release与Registry 原包端到端检查（E2E）。发布事务 MUST不读取、复制或依赖Task复盘文档、决定状态或来源关系。

#### Scenario: dispatch 正式 release transaction
- **WHEN** 维护者明确授权publication且runner准备dispatch唯一protected workflow
- **THEN** runner MUST验证release/support Tasks、Candidate run/source、Git bridge与适用准备事实
- **AND** MUST不查询Retrospective Application、Task复盘关系或本机Markdown

#### Scenario: 读取完成的发布链路
- **WHEN** 调用方按publish run ID读取release transaction evidence
- **THEN** read model MUST返回release/support Tasks和公共发布事实
- **AND** schema MUST不包含`retrospectiveSources`

#### Scenario: transaction 在公共写入前失败
- **WHEN** Task、Candidate、Git或准备事实不匹配
- **THEN** runner MUST在tag、npm publish或GitHub Release写入前失败
- **AND** MUST不通过复盘状态补足或绕过缺失事实

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
- **WHEN** tag、npm、dist-tag、GitHub Release和Registry 原包端到端检查（E2E）已成立，且`dev`包含release冻结后交付的新内容
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

### Requirement: 发布失败必须保留不可逆事实与attempt恢复路径
Protected transaction MUST为current GitHub run/attempt保存逐步evidence，并 MUST从正式Git/npm/GitHub readback记录已经成立的tag、npm version/integrity、dist-tag、GitHub Release与Registry 原包端到端检查（E2E）事实。失败Result MUST区分同attempt恢复、明确新attempt恢复和必须新version/人工处理，不得撤销或伪装已成立事实。

#### Scenario: Tag创建后npm失败
- **WHEN** immutable tag已指向冻结source但npm publish或OIDC exchange失败
- **THEN** evidence MUST保留tag commit、失败步骤、run/attempt与安全诊断
- **AND** 恢复 MUST继续消费同一context与tarball并明确是否需要新attempt，MUST NOT删除、移动tag或改用本机token publish

#### Scenario: npm成功后公开readback失败
- **WHEN** Registry已存在同version且integrity匹配冻结tarball，但dist-tag、GitHub Release或Registry 原包端到端检查（E2E）尚未完成
- **THEN** rerun MUST复用已发布npm事实并只补齐未成立步骤
- **AND** MUST NOT再次publish、重新pack、unpublish或覆盖相同version

#### Scenario: 已有事实发生冲突
- **WHEN** existing tag source、Registry integrity或GitHub Release metadata与冻结context不一致
- **THEN** transaction MUST返回需要人工处理或新version的blocked恢复分类并保留所有事实
- **AND** MUST NOT自动覆盖、删除、移动或弱化protected environment
