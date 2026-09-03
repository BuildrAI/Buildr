---
name: buildr-release
description: 准备、检查、发布和验证Buildr候选版或稳定版时使用，覆盖release-<version>人工选择集合、release HEAD Candidate、唯一tarball、受保护发布事务、release到main、发布后dev来源核验、失败恢复与发布后验证；用户提到准备发布、发布RC、发布候选版、发布稳定版、检查是否可发布、继续或排查Buildr发布时触发。
---

# Buildr Release

本Skill只编排Buildr自举workspace的产品发布，不作为Buildr内置能力分发。发布事实以current repository、Task/Environment、发布源码与产物的公开事实、GitHub、npm官方registry和实际workflow状态为准，不把示例版本、聊天摘要、checklist勾选或历史stdout当成current authority。

## 1. 解析意图与授权

先固定一种意图，不在阶段之间自动升级：

- `检查候选版|检查稳定版`：只读检查release集合、版本、Candidate、artifact、Task correlation、main、workflow和公共事实；effects必须为空。
- `准备候选版|准备稳定版`：创建或更新人工选择的`release-<version>`，形成matching Candidate与唯一tarball，经受保护PR收敛到`main`，停在正式release workflow dispatch/tag/npm审批之前。
- `发布候选版|发布稳定版`：只在matching准备事实成立后dispatch唯一protected transaction，跟踪tag/npm/GitHub Release/Registry readback，并在Publication成功后核验frozen release的dev来源。
- `继续发布|排查发布`：先回读全部owner和公共事实，从可证明中断点继续；不得重复已成功的不可逆步骤。

候选版与稳定版是不同授权。用户未指定版本、baseline或待选择commit时，先按当前公开事实形成一份完整的缺省方案并请求确认，不把输入缺失直接转化为让用户手工填写hash。候选版的缺省方案可以沿用当前候选系列递增的下一个RC；dev baseline默认在fetch并回读后固定为current `dev` authority的精确commit/tree；未明确选择的后续dev commits不自动进入release。方案必须展示version、dev ref、baseline SHA/tree、selection policy、预期effects和不会执行的公开副作用。

只有在完整方案已经展示后，用户的“确认”才构成对该方案的授权；如果用户只回复“确认”而上一次消息没有完整方案，Agent必须先完成只读解析并展示方案。确认后将baseline和selection转换为固定identity传给release selection owner，后续不得重新读取移动中的`dev`来改变已确认内容。

## 2. 发布模型实现就绪门禁

在任何release branch、PR、workflow、tag或npm写入前，确认当前Product已提供并能回读以下五类current能力：

1. release selection/provenance：精确dev baseline、ordered selection chain、release HEAD/tree、freeze history、create/update/freeze/reopen/abandon/cleanup结果；
2. release-source Product Candidate：matching release source、Candidate generation、完整required owners与唯一tarball manifest/integrity；
3. release Task correlation：release/support Tasks 的记录关联与发布 Environment；不要求支持任务旧交接或收尾运行；
4. shared readiness/protected transaction：同一context digest、collect-all findings、effects为空的local检查与唯一publish workflow；
5. release→main、Publication后dev provenance reconciliation与release closeout：generation carrier、tree equality、selection的完整dev来源、dev新内容保留、零中间资源和正式release ref保留核验。

当前P0 release集合契约与P2 shared readiness/protected transaction已经实现；P1/P3或任一其他owner/read model尚未实现或无法证明current时：

- 检查意图返回`blocked: release-model-implementation-incomplete`，列出缺失owner和对应Parent Contribution；
- 准备、发布、继续意图在任何Git/PR/workflow/public副作用前停止；
- 不运行旧“冻结最新dev→创建dev→main PR→发布前main→dev bridge”或发布后main→dev merge流程；
- 不用手工Git、checklist、近似ref、旧Candidate或caller-claimed success补造缺失能力。

这是迁移期安全门禁，不表示P0本身实现了P1/P2/P3。

## 3. 建立current发布事实

1. 从Buildr workspace root解析Product，不根据cwd猜测。
2. 读取root/Product/Buildr Service `AGENTS.md`、Buildr Core、canonical release specs、current release knowledge、release checklist、package/lockfile、CHANGELOG、`verify.yml`和`publish.yml`。
3. 使用Git readback核对workspace、worktrees、`dev`、目标`release-<version>`、`main`、remote refs和tags；分别读取commit与tree identity。
4. 使用npm官方registry读取version、`latest`、`next`与integrity；读取GitHub PR/check/workflow/Environment/Release事实。
5. 从System Installation version规则和release contract确认version、`v<version>`、RC=`next`、GA=`latest`和唯一`publishAuthority`。
6. 从各Application/current owner回读Task/Environment/Candidate/artifact/correlation事实；不得直接读取SQLite或复制专业Result。
7. 使用release notes提取器确认CHANGELOG存在唯一匹配章节和具体正文。

首次发布必须证明目标npm version、tag和GitHub Release不存在；恢复同一transaction分别核对已有不可逆事实与matching integrity，不把“已存在”直接解释为成功或冲突。

## 4. 检查发布条件

只读检查至少覆盖：

- 目标版本、tag、dist-tag、release notes和package metadata一致；
- release baseline来自维护者指定，或来自经维护者确认的缺省方案，并且可由current `dev`证明为精确commit/tree；
- selection chain只含明确选择且带`-x`provenance的dev commits；没有`sourceDevCommit`的release-only metadata必须具有独立可验证的dev回流证据，当前owner不支持时拒绝该entry；release不自动追随dev；
- current release HEAD/tree与Candidate generation、唯一tarball、release→main PR/main tree和transaction context完全匹配；
- Hosted Windows、Host Node、Launcher、exact Node/PATH、primary owner、affected/full、bounded scheduling、heartbeat/checkpoint和timing复用现有唯一验证owner；
- release/support Task correlation来自current read model，Delivery、Activation、Environment Cleanup、Diagnostics和Publication分别表达；
- `publish.yml`只有一个依赖可逆门禁的protected job拥有`npm-production`、`contents: write`和`id-token: write`，且一次审批消费同一context和tarball；
- release→main只有一个受保护PR；若发生main reconciliation，PR必须使用merge commit并回读两个父提交与reconciliation identity，不能用squash/rebase或tree相等替代；
- 候选版不误用`latest`，稳定版不误用`next`，RC反馈和已知限制已评估。

输出`ready|blocked|already-published`、current identities、collect-all findings、`effects: []`和唯一下一步。检查不得顺带修复、dispatch或创建ref。

## 5. 准备发布

准备阶段是正式开发/发布Task，遵循`task-triage`、`task-worktree`、`task-verification`、`task-finish`和self-bootstrap唯一runner。Agent直接读取OpenSpec、代码、Git、文件和专业结果完成开发；需要隔离Git位置时使用matching Worktree，需要依赖时调用Buildr Service真实`npm ci`入口：

1. 对明确指定的`<version>`、精确`<dev-baseline>`和有序待选择dev commits按原值处理；对未指定项先fetch并读取current `dev`，形成包含精确SHA/tree的缺省方案并取得确认，再重新证明确认的commits属于current dev authority。确认后不得把移动中的`dev`当作新的baseline或隐式扩展selection。
2. 创建或复用唯一`release-<version>`协调Task和matching Worktree。该Task的intent必须覆盖selection、main coverage、完整Candidate、唯一tarball、release→main与零副作用readiness；这些事实全部成立前Task保持active，不调用complete。依赖准备直接使用matching Worktree中Buildr Service的`npm ci`入口；不得在Product根执行。
3. 从active Task与current Worktree evidence生成closed execution binding。release selection、reopen、freeze、main coverage/reconciliation与local cleanup每次写入前都必须重新生成并核验该binding；只允许matching Task worktree的`codex/release-<version>`分支，正式`release-<version>`作为受控ref同步移动。retained primary worktree、其他Task worktree、陈旧branch/HEAD或caller路径声明必须零写入失败；owner不得checkout retained workspace。
4. 通过release selection owner创建或核验唯一`release-<version>`集合。create只建立正式release ref与lifecycle refs，不切换Task分支、不隐含push；同版本identity冲突时停止。
5. 对维护者明确列出的commit逐个执行selection update；只允许`cherry-pick -x`，并且必须在绑定的Task分支执行，成功后原子同步正式release ref。冲突立即停止，保留可诊断现场，不自动解决、继续、rebase、reset、force push或直接编辑冒充选择成功。
6. version、CHANGELOG、README/known limitations/checklist、测试修复或release owner修复等需要在Candidate前独立交付的内容，必须使用scope/intent明确、基于current `dev`的release support Task worktree完成实现、审查、验证与交付；再把delivered dev commit以`cherry-pick -x`选择到既有release集合。不得直接在release worktree修复后把整条release历史合并或倒灌`dev`，也不得用`release-<version>`协调Task承担这类提前内容贡献。
7. 运行changed/affected开发反馈并读取timing；它不等于完整Candidate。support Task由Agent依据真实现场完成开发、验证、交付和Task结果登记，matching self-bootstrap仍由唯一runner完成；support Task terminal或交付结果都不使release协调Task completed。
8. Freeze current release HEAD/tree与selection chain，随后立即在matching release execution worktree执行current main coverage。main已是release祖先时直接通过；否则只有main涉及的Product路径都能由current dev/release provenance覆盖时，owner才可用原release tree创建显式双亲history commit。发现main独有Product路径时零写入停止，先通过正式Task交付dev；禁止工作树merge、人工解冲突、`ours`、reset、rebase或force push。
9. history commit形成后核验两个父提交、coverage identity以及post tree精确等于pre tree，递增并重新freeze final generation。该SHA是唯一final release source；任何pre-reconciliation Candidate或tarball仅保留为stale历史，不得复用。
10. 只对final source运行GitHub分布式`Candidate gate`；aggregate必须绑定同一final SHA/tree/generation、registry、唯一tarball、macOS/Windows/Host Node evidence。单个job绿色不能替代aggregate。aggregate失败、缺失或source不匹配时，release协调Task保持active，不得complete或把support delivery误报为准备完成。
11. 为final generation创建或复用唯一`codex/release-main-<version>-g<generation>` carrier，并只以该carrier创建唯一release→main受保护PR；正式远端`release-<version>`不作为PR carrier。release PR必须使用GitHub `Create a merge commit`；终态readback必须证明merge commit、两个父提交、current carrier和main tree。Candidate后current main若前进，旧Candidate、tarball、carrier与PR立即stale，必须重新coverage/reconciliation形成下一generation并完整重跑Candidate。同SHA暂态失败先用`candidate-failed-shard-retry.ts inspect`读取matching run与失败分片，取得明确授权后只执行`rerun --failed`；不得dispatch新的完整run或跨run拼接evidence。
12. merge后核验`origin/main^{tree}`精确等于当前release tree，并核对main commit的父提交包含current carrier。merge method、tree或remote ref不一致时立即停止。
13. 先用exact Node运行`tools/release/release-preparation-binding.ts prepare --task <task-id> --workspace <canonical-workspace> --repo <release-worktree> --source-commit <main-commit> --output <private-json>`；它只在matching Worktree的Buildr Service root执行一次`npm ci`并返回closed Preparation binding。随后把该binding写入`release-orchestration-runner.ts prepare-dispatch`输入的`transaction.preparationBinding`；readiness只读构造并检查`buildr.release-context/v2`，不得再次安装依赖。它只读取selection、Candidate aggregate/唯一artifact、Task correlation、matching Worktree、Release Preparation、exact Node、main/dev与workflow facts，要求context digest稳定、collect-all findings完整且`effects: []`。调用后删除private JSON，不把临时路径写入Result。不得本地模拟OIDC、审批、tag、npm publish或GitHub Release。
14. 只有current selection、Candidate aggregate、唯一tarball、main tree与dispatch-check readiness全部matching时，编排结果才进入`awaiting-publication-authorization`。报告current orchestration identity、context digest、Release Phase Timeline identity、已成立effects和唯一publication授权请求，然后停止。`release-<version>`协调Task必须保持active；Task状态、历史授权或readiness通过都不构成publication授权。

## 6. 发布版本

只有用户明确授权对应RC或GA后执行：

1. fetch并重新核验current release HEAD/tree、main tree、Candidate generation、tarball manifest/integrity、Task correlation、readiness context和workflow digest全部matching。
2. 首次发布确认tag/npm version/GitHub Release不存在；恢复路径核对已有事实与同一context/tarball，不删除或覆盖。
3. 使用Product `.node-version`证明的exact Node调用`release-orchestration-runner.ts dispatch`，同时传入维护者对current frozen context的显式publication授权与expected context digest。编排器先重跑无副作用readiness；digest一致后才调用唯一transaction owner并只dispatch一次`publish.yml`。context漂移时旧授权失效且零远端写入。本机不创建/push tag、不dispatch probe-only workflow。
4. read-only jobs按context中的Candidate run下载matching `candidate-aggregate`和`candidate-package`，验证aggregate identity与tarball manifest/bytes后供Host Node、Launcher和protected job复用；publish run不得build Application Payload、`npm pack`或形成第二份候选物。全部通过后唯一protected job请求一次`npm-production`审批。
5. 审批后同一job完成OIDC proof、final pre-tag convergence、tag ensure、Registry snapshot、`npm publish <same-tarball>`、双dist-tag/integrity readback、GitHub Release ensure和官方Registry精确安装smoke。
6. 已存在npm version只在integrity与manifest相同、tag/source/context匹配时复用；否则停止，不unpublish、不覆盖、不重新pack。
7. 按publish run调用`release-orchestration-runner.ts closeout`。编排器先由hosted evidence owner inspect `release-evidence-*`，核验selection、release/support Tasks、Candidate、main、publish、tag、npm/GitHub Release、Registry smoke与context digest；临时下载立即清理。
8. 同一closeout动作随后调用`release-git-convergence.ts reconcile-dev`执行只读dev provenance reconciliation，再调用Git closeout owner保留并核验正式远端`release-<version>`，幂等删除matching generation carrier、本地release branch、selection lifecycle refs、owned worktree与临时资源。来源、ownership或identity不可证明时停止在对应owner，保留Publication和已成立effects；不得写入dev或撤销Publication。carrier与local selection cleanup继续需要本次显式授权，正式远端release ref删除仍是独立可选授权。
9. lifecycle `closed`成立后，编排器从canonical Workspace、retained Product source和exact Node即时解析controller，依次执行协调Task no-change completion、Worktree cleanup与最终Doctor。Task已terminal但cleanup或Doctor失败时，恢复只继续未完成owner，不重跑Publication、reconciliation、Git closeout或Task completion。
10. 每次暂停、失败和成功都报告同一编排结果中的current action、orchestration/context/Timeline identities、owner steps、已成立effects与唯一next action；原transaction/evidence/Git convergence入口只保留为owner诊断和窄恢复入口，不再由Agent手工拼成第二套成功结论。

RC不得主动移动`latest`；GA确认`latest`指向目标稳定版并只报告`next`现状，不擅自删除或移动非目标tag。

## 7. 中断与失败恢复

- release内容变化：旧Candidate/artifact/readiness/context全部stale，形成新generation和唯一tarball，不拼接旧evidence。
- frozen Candidate失败且需要修复：保持同一release协调Task与selection，先从current `dev`创建或复用窄support Task worktree，在该Task完成修复及相关检查并把成果交付`dev`。同时从GitHub、Git tag、npm官方registry、GitHub Release和protected workflow回读目标version的全部公开/不可逆事实；只有证明尚无tag、npm version、GitHub Release且protected transaction未开始公共mutation，维护者才可独立授权selection `reopen --confirm --reason <text>`。reopen只保留immutable freeze history并释放current frozen ref，不隐含update/push；随后只把matching delivered dev commit逐个`cherry-pick -x`、重新freeze、普通push并对新SHA运行完整Candidate。不得直接在release worktree修复再回灌dev；任何公开事实已存在时停止并选择新version，不接受caller布尔值或历史stdout代替证明。
- 同version release协调Task在本模型生效前已被提前completed：保留terminal Task，不直接改SQLite或伪造reopen；这是历史异常，不是后续version的正常恢复模板。新version必须始终使用唯一active协调Task直到lifecycle closed。
- selection冲突：保持pre-operation identity和冲突现场，停止后续选择/remote/public mutation；只在维护者作出新决定后恢复。
- release→main tree不一致或remote race：停止publication，不用历史形状、`ours`、reset或force push掩盖。
- protected transaction失败：先读取terminal run/attempt与逐步evidence，按`same-attempt`、`new-attempt`或`blocked-new-version`解释恢复；已创建tag时保留tag和同context事实，不删除tag后重发。
- npm version已存在：先比较official registry integrity与manifest；一致才恢复后续readback，不一致fail closed。
- GitHub Release已存在：核对tag target、notes、prerelease/Latest；一致才复用，不自动覆盖。
- publish或Release成功但smoke/网络失败：保留不可逆事实，从同一context/readback恢复，不重复publish。
- Publication成功但dev provenance reconciliation、Activation、Environment Cleanup、Diagnostics或必需closeout失败：保持同一active协调Task，按lifecycle recovery identity恢复对应owner，不撤销Delivery/Publication、不写入dev、不重跑Candidate或创建resume Task。
- release orchestration部分成功：重新调用同一action并消费current owner readback；identity一致的步骤标记`reused`，只执行唯一未完成owner。Task已no-change completed时只能继续Environment cleanup/Doctor，不重开Task或重新dispatch。
- 发布后发现产品问题：RC发布新prerelease，GA发布patch，必要时deprecate或明确移动dist-tag；不默认unpublish。

## 8. 完成报告

报告：

- 类型、version、release identity、dev baseline、selection chain、release HEAD/tree；
- Candidate generation/source、aggregate、唯一tarball filename与integrity、各shard/timing和重跑范围；
- release/support Tasks 的记录关联、发布 Environment 与实际发布证据；
- release→main PR、main commit/tree、publication context/run/approval、tag/npm/dist-tags/GitHub Release/Registry smoke；
- post-publication dev provenance reconciliation identity、dev baseline/source commits/current dev HEAD和`published-but-dev-reconciliation-blocked`等独立attention；
- matching Task Worktree、generation carrier、本地selection资源、正式远端release ref保留核验和可选删除授权事实；
- `buildr.release-phase-timeline/v1` identity、selection/freeze、Candidate每个`runId + runAttempt`、成功shard evidence原attempt、实际rerun scope、aggregate、PR merge、readiness、人工授权、平台排队、Environment approval、Publication、reconciliation和closeout时间边界；缺失边界明确`unknown`，不估算duration；
- 当前缺失owner/read model或迁移Contribution；未齐备时明确`release-model-implementation-incomplete`。

不要把“PR已创建”“tag已推送”“workflow已启动”单独视为完成；也不要因后续维护失败撤销已经成立的Delivery或Publication。
