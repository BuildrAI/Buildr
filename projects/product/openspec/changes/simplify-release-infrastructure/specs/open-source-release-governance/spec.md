## MODIFIED Requirements

### Requirement: Release workflow 必须只发布 npm package
Buildr release workflow MUST 只将唯一 `@buildr-ai/buildr` tarball 发布到 npm Registry。Workflow MUST 从显式 dispatch 的 version/tag、source commit、candidate identities、dist-tag 与 release notes 解析唯一 release contract，消费候选阶段唯一一次 application payload build 和 `npm pack`的结果，正式发布不得构建，并让 smoke、protected release transaction 与 Registry integrity readback 消费同一 tarball bytes。GitHub Release MAY 承载 tag notes metadata，但 MUST NOT 上传 npm tarball、Launcher、SEA、PKG/MSI、platform manifest 或 checksums。

#### Scenario: 可逆验证先于 npm publish
- **WHEN** dispatch workflow 准备正式发布
- **THEN** npm inventory、Host Node CLI/Web、真实平台Launcher lifecycle、package identity、integrity 与 release notes checks MUST在完整候选中通过，发布消费matching证据并在唯一 `npm-production` job请求审批前复核相关身份
- **AND** 任一失败 MUST 阻止 Environment deployment与不可逆发布

#### Scenario: 发布并回读同一 tarball
- **WHEN** protected release transaction 获得授权
- **THEN** workflow MUST 先完成 current authority probe、最终 pre-tag 校验和匹配 tag ensure，再发布已冻结 tarball并从官方 Registry读取精确 version/integrity后重新安装 smoke
- **AND** MUST NOT重新 pack、切换本地 publish或把 Actions artifact作为公共下载地址

### Requirement: Publication 必须从已完成 Task 的权威环境事实重建

Buildr Release MUST在matching release Worktree中使用冻结source的锁文件、Product exact Node和统一消费准备入口，只准备当前动作必需依赖。准备结果 MUST保存source inputs、cwd、command、Node和真实outcome；无需单独准备绑定文件，MUST NOT保存stdout或凭证。无副作用readiness MUST只读取当前执行条件，不得执行依赖安装。

#### Scenario: Release Task Finish 已清理 worktree
- **WHEN** matching release Worktree已清理且需要恢复发布后登记或清理
- **THEN** Release MUST从canonical Workspace读取任务及发布事实，使用retained工具恢复未完成步骤

- **AND** workflow MUST在其执行位置使用统一最低充分准备入口
- **AND** MUST NOT完成或重开Task、恢复旧worktree或在`projects/product`执行`npm ci`

#### Scenario: recipe、cwd 或 lockfile 不匹配
- **WHEN** 必需准备失败或source inputs、Node、cwd漂移
- **THEN** Release MUST只阻塞依赖该准备的readiness，不改变Task、Candidate、Git或Publication事实

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
- **THEN** reconciliation MUST核验Publication context、current frozen selection、正式release ref、published main commit/tree有效且current main包含该发布提交
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

## REMOVED Requirements

### Requirement: 候选准备必须先演练后正式确认
**Reason**: 用户已确认取消机械双跑，完整证明由同一候选消费配方承担。
**Migration**: 正常准备一次完整候选；可选演练匹配精确源码/产物/相关输入时直接复用。

## ADDED Requirements

### Requirement: 发布公开状态查询必须严格区分不存在与未知
Git、GitHub与官方npm查询 MUST验证目标和返回状态。明确不存在才可进入创建；网络超时、权限错误、无效响应与无法判定的404 MUST返回未知或权限诊断，MUST NOT当作不存在。历史失败运行本身 MUST不永久阻塞同版本无公开副作用修复；活动运行和已有公开事实 MUST按当前真实结果判断。

#### Scenario: 权限或网络查询失败
- **WHEN** 查询返回401、403、超时、服务错误或无效JSON
- **THEN** 工具 MUST返回对应未知/权限结果并停止依赖不存在结论的写入

#### Scenario: 无公开事实的失败运行
- **WHEN** 历史运行已终止失败，所有权威查询均确认目标未公开
- **THEN** 工具 MUST允许已授权同版本修复与重新准备
- **AND** 活动运行 MUST先核实并安全恢复，不能重复派发

### Requirement: 发布恢复必须有界且复用已发生公开事实
同身份可逆暂态恢复 MUST无需重复用户确认，并 MUST限制自动重试次数、单次请求与总等待时间。明确权限错误、内容冲突、断言失败及重复同错 MUST进入诊断。标签/npm/GitHub已存在且匹配时 MUST复用，仅补齐未完成操作。

#### Scenario: 本地标签已创建而推送失败
- **WHEN** 本地tag匹配目标且远端明确不存在
- **THEN** 恢复 MUST复用本地tag并推送，报告两阶段结果
- **AND** 本地或远端不匹配 MUST保留冲突且不得覆盖

#### Scenario: npm发布成功但响应或后续验证失败
- **WHEN** 官方Registry确认相同版本和integrity
- **THEN** 恢复 MUST跳过npm publish并继续dist-tag、GitHub Release或安装验证
- **AND** 网络未知 MUST先回读而非重复publish

#### Scenario: 超时但没有断言失败
- **WHEN** 执行超时且日志未显示断言失败
- **THEN** 工具 MUST记录进程、内部等待和资源诊断
- **AND** MUST不单凭没有断言失败就认定暂态并无限重跑

### Requirement: 发布消费覆盖必须由共享定义检查
候选和发布 MUST使用同一检查定义、参数和环境档位；发布前每项检查 MUST声明候选证明或必须临发布执行的原因。正式发布 MUST验证同一产物及matching覆盖，MUST不首次执行可前移的依赖/路径/脚本检查。

#### Scenario: 新增发布前检查
- **WHEN** 配方新增非权限或非时变状态检查
- **THEN** 候选覆盖校验 MUST要求对应可执行证明，遗漏时失败

#### Scenario: 真正临发布检查
- **WHEN** 检查需要当前OIDC、平台审批或临发布外部状态
- **THEN** 配方 MUST明确该边界并在受保护阶段执行
- **AND** 无公开副作用验收 MUST如实报告尚未执行的真实权限与写入

### Requirement: 当前发布文档和分发链接必须保持单一权威
当前发布架构、流程、验证与恢复正文 MUST统一在Product knowledge，技能和其他文档按职责保留入口和链接；过时重复正文 MUST删除或合并。npm包中的相对文档链接 MUST指向包内存在目标，外部维护文档 MUST指向官方可访问版本源码。历史发布证据与已归档Change MUST保留。

#### Scenario: 文档迁移与打包
- **WHEN** 发布相关文档删并迁移
- **THEN** 仓库引用、技能、测试和打包规则 MUST同步更新
- **AND** 验收 MUST检查真实tarball中的文档链接而非仅检查源码目录
