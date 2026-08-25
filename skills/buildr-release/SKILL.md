---
name: buildr-release
description: 准备、检查、发布和验证Buildr候选版或稳定版时使用，覆盖release-<version>人工选择集合、release HEAD Candidate、唯一tarball、受保护发布事务、release到main、发布后dev来源核验、失败恢复与发布后验证；用户提到准备发布、发布RC、发布候选版、发布稳定版、检查是否可发布、继续或排查Buildr发布时触发。
---

# Buildr Release

本Skill只编排Buildr自举workspace的产品发布，不作为Buildr内置能力分发。发布事实以current repository、Task/Environment/Development/Finish/self-bootstrap公开read model、GitHub、npm官方registry和实际workflow状态为准，不把示例版本、聊天摘要、checklist勾选或历史stdout当成current authority。

## 1. 解析意图与授权

先固定一种意图，不在阶段之间自动升级：

- `检查候选版|检查稳定版`：只读检查release集合、版本、Candidate、artifact、Task correlation、main、workflow和公共事实；effects必须为空。
- `准备候选版|准备稳定版`：创建或更新人工选择的`release-<version>`，形成matching Candidate与唯一tarball，经受保护PR收敛到`main`，停在正式release workflow dispatch/tag/npm审批之前。
- `发布候选版|发布稳定版`：只在matching准备事实成立后dispatch唯一protected transaction，跟踪tag/npm/GitHub Release/Registry readback，并在Publication成功后核验frozen release的dev来源。
- `继续发布|排查发布`：先回读全部owner和公共事实，从可证明中断点继续；不得重复已成功的不可逆步骤。

候选版与稳定版是不同授权。类型、版本、baseline或待选择commit不唯一时停止确认；不得默认稳定版、最新`dev`或全部未发布commit。

## 2. 发布模型实现就绪门禁

在任何release branch、PR、workflow、tag或npm写入前，确认当前Product已提供并能回读以下五类current能力：

1. release selection/provenance：精确dev baseline、ordered selection chain、release HEAD/tree、freeze history、create/update/freeze/reopen/abandon/cleanup结果；
2. release-source Product Candidate：matching release source、Candidate generation、完整required owners与唯一tarball manifest/integrity；
3. release Task correlation：release/support Tasks、Environment、Development handoff、Finish Delivery和self-bootstrap的closed portable关联；
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
6. 从各Application/current owner回读Task/Environment/Development/Finish/self-bootstrap/Candidate/artifact/correlation事实；不得直接读取SQLite或复制专业Result。
7. 使用release notes提取器确认CHANGELOG存在唯一匹配章节和具体正文。

首次发布必须证明目标npm version、tag和GitHub Release不存在；恢复同一transaction分别核对已有不可逆事实与matching integrity，不把“已存在”直接解释为成功或冲突。

## 4. 检查发布条件

只读检查至少覆盖：

- 目标版本、tag、dist-tag、release notes和package metadata一致；
- release baseline来自维护者指定且可由current `dev`证明的精确commit/tree；
- selection chain只含明确选择且带`-x`provenance的dev commits；没有`sourceDevCommit`的release-only metadata必须具有独立可验证的dev回流证据，当前owner不支持时拒绝该entry；release不自动追随dev；
- current release HEAD/tree与Candidate generation、唯一tarball、release→main PR/main tree和transaction context完全匹配；
- Hosted Windows、Host Node、Launcher、exact Node/PATH、primary owner、affected/full、bounded scheduling、heartbeat/checkpoint和timing复用现有唯一验证owner；
- release/support Task correlation来自current read model，Delivery、Activation、Environment Cleanup、Diagnostics和Publication分别表达；
- `publish.yml`只有一个依赖可逆门禁的protected job拥有`npm-production`、`contents: write`和`id-token: write`，且一次审批消费同一context和tarball；
- release→main只有一个受保护PR；squash后main tree等于release tree；
- 候选版不误用`latest`，稳定版不误用`next`，RC反馈和已知限制已评估。

输出`ready|blocked|already-published`、current identities、collect-all findings、`effects: []`和唯一下一步。检查不得顺带修复、dispatch或创建ref。

## 5. 准备发布

准备阶段是正式开发/发布Task，遵循`task-triage`、`task-environment`、`task-development`、`task-verification`、`task-finish`和self-bootstrap唯一runner：

1. 取得维护者确认的`<version>`、精确`<dev-baseline>`和有序待选择dev commits；fetch后重新证明这些commits属于current dev authority。
2. 创建或复用唯一`release-<version>`协调Task/Environment。该Task的intent必须覆盖selection、完整Candidate、唯一tarball、release→main与零副作用readiness；这些事实全部current前保持active/blocked，不调用Task Finish或complete。只由ready的`service:product/buildr/buildr.npm-ci` recipe在Buildr Service root准备依赖，使用Receipt的exact Node/CLI；不得在Product根`npm ci`。
3. 通过release selection owner创建或核验唯一`release-<version>`集合。create不隐含push；同版本identity冲突时停止。
4. 对维护者明确列出的commit逐个执行selection update；只允许`cherry-pick -x`。冲突立即停止，保留可诊断现场，不自动解决、继续、rebase、reset、force push或直接编辑冒充选择成功。
5. version、CHANGELOG、README/known limitations/checklist、测试修复或release owner修复等需要在Candidate前独立交付的内容，必须使用scope/intent明确、基于current `dev`的release support Task worktree完成Development/Verification/Finish并先交付`dev`；再把delivered dev commit以`cherry-pick -x`选择到既有release集合。不得直接在release worktree修复后把整条release历史合并或倒灌`dev`，也不得用`release-<version>`协调Task承担这类提前Finish的内容贡献。
6. 运行changed/affected开发反馈并读取timing；它不等于完整Candidate。support Task按正式Development/Verification/Finish闭环交付，matching self-bootstrap仍由唯一runner完成，失败不改写Delivery；support Task terminal、Delivery或Activation都不使release协调Task completed。
7. Freeze current release HEAD/tree与selection chain；任一内容变化使旧freeze、Candidate、artifact、readiness和context stale。
8. 对该release source运行GitHub分布式`Candidate gate`；aggregate必须绑定同一source SHA/tree、registry、唯一tarball、macOS/Windows/Host Node evidence。单个job绿色不能替代aggregate。aggregate失败、缺失或source不匹配时，release协调Task保持active/blocked，不得Finish/complete或把support delivery误报为准备完成。
9. 为current generation创建或复用唯一`codex/release-main-<version>-g<generation>` carrier，并只以该carrier创建唯一release→main受保护PR；正式远端`release-<version>`不作为PR carrier。新commit形成新release SHA后必须重新运行完整Candidate；同SHA暂态失败只重跑失败job和aggregate。
10. merge后核验`origin/main^{tree}`精确等于冻结release tree。commit identity可因squash不同，tree不一致或remote race立即停止。
11. 用transaction runner的默认`readiness`动作构造并检查`buildr.release-context/v1`；只读取selection、Candidate aggregate/唯一artifact、Task correlation、Environment/exact Node、main/dev与workflow facts，要求context digest稳定、collect-all findings完整且`effects: []`。不得本地模拟OIDC、审批、tag、npm或GitHub Release。
12. 只有current selection、Candidate aggregate、唯一tarball、main tree与dispatch-check readiness全部matching时，才报告“准备完成，等待matching frozen context的publication授权”，然后停止。`release-<version>`协调Task必须保持active；Task状态、历史授权或readiness通过都不构成publication授权。

## 6. 发布版本

只有用户明确授权对应RC或GA后执行：

1. fetch并重新核验current release HEAD/tree、main tree、Candidate generation、tarball manifest/integrity、Task correlation、readiness context和workflow digest全部matching。
2. 首次发布确认tag/npm version/GitHub Release不存在；恢复路径核对已有事实与同一context/tarball，不删除或覆盖。
3. 使用release Task Environment保存的exact Node启动唯一transaction runner的显式`dispatch`动作，并传入对current frozen context的publication授权；runner逐项绑定main、tree、workflow digest与exact Node后只dispatch一次`publish.yml`并定位同一run。本机不创建/push tag、不dispatch probe-only workflow。
4. read-only jobs按context中的Candidate run下载matching `candidate-aggregate`和`candidate-package`，验证aggregate identity与tarball manifest/bytes后供Host Node、Launcher和protected job复用；publish run不得build Application Payload、`npm pack`或形成第二份候选物。全部通过后唯一protected job请求一次`npm-production`审批。
5. 审批后同一job完成OIDC proof、final pre-tag convergence、tag ensure、Registry snapshot、`npm publish <same-tarball>`、双dist-tag/integrity readback、GitHub Release ensure和官方Registry精确安装smoke。
6. 已存在npm version只在integrity与manifest相同、tag/source/context匹配时复用；否则停止，不unpublish、不覆盖、不重新pack。
7. 按publish run inspect `release-evidence-*`，核验selection、release/support Tasks、Candidate、main、publish、tag、npm/GitHub Release、Registry smoke与context digest；临时下载立即清理。
8. Publication成功后调用`release-git-convergence.mjs reconcile-dev`执行只读dev provenance reconciliation：核验passed Publication、current frozen selection identity/generation、正式remote release ref、published main commit/tree，以及selection baseline和全部ordered `sourceDevCommit`仍由current remote `dev`包含。结果必须`effects: []`并保留冻结后进入dev的新内容；不得读取merge policy作为门禁、要求main成为dev祖先、比较dev与release tree相等，或创建worktree/merge/commit/push。任一来源或identity不可证明时返回`published-but-dev-reconciliation-blocked`与稳定recovery identity，不得写入dev或撤销Publication。
9. Task Environment cleanup与release closeout分别走owner。closeout必须保留并核验正式远端`release-<version>`，幂等删除matching generation carrier、本地release branch、selection lifecycle refs、owned worktree与临时资源；ownership或identity不明时fail closed。可选删除正式远端release ref仍需单独授权，但不阻止协调Task完成。
10. Publication、matching dev provenance reconciliation与必需closeout全部通过后，lifecycle返回`closed`，此时才以no-change完成唯一`release-<version>`协调Task；不得新建finalize或resume协调Task。

RC不得主动移动`latest`；GA确认`latest`指向目标稳定版并只报告`next`现状，不擅自删除或移动非目标tag。

## 7. 中断与失败恢复

- release内容变化：旧Candidate/artifact/readiness/context全部stale，形成新generation和唯一tarball，不拼接旧evidence。
- frozen Candidate失败且需要修复：保持同一release协调Task与selection，先从current `dev`创建或复用窄support Task worktree，在该Task完成Development/Verification/Finish并把修复交付`dev`。同时从GitHub、Git tag、npm官方registry、GitHub Release和protected workflow回读目标version的全部公开/不可逆事实；只有证明尚无tag、npm version、GitHub Release且protected transaction未开始公共mutation，维护者才可独立授权selection `reopen --confirm --reason <text>`。reopen只保留immutable freeze history并释放current frozen ref，不隐含update/push；随后只把matching delivered dev commit逐个`cherry-pick -x`、重新freeze、普通push并对新SHA运行完整Candidate。不得直接在release worktree修复再回灌dev；任何公开事实已存在时停止并选择新version，不接受caller布尔值或历史stdout代替证明。
- 同version release协调Task在本模型生效前已被提前completed：保留terminal Task与既有Finish审计事实，不直接改SQLite、不伪造reopen或把旧记录迁移成current；这是历史异常，不是后续version的正常恢复模板。新version必须始终使用唯一active协调Task直到lifecycle closed。
- selection冲突：保持pre-operation identity和冲突现场，停止后续选择/remote/public mutation；只在维护者作出新决定后恢复。
- release→main tree不一致或remote race：停止publication，不用历史形状、`ours`、reset或force push掩盖。
- protected transaction失败：先读取terminal run/attempt与逐步evidence，按`same-attempt`、`new-attempt`或`blocked-new-version`解释恢复；已创建tag时保留tag和同context事实，不删除tag后重发。
- npm version已存在：先比较official registry integrity与manifest；一致才恢复后续readback，不一致fail closed。
- GitHub Release已存在：核对tag target、notes、prerelease/Latest；一致才复用，不自动覆盖。
- publish或Release成功但smoke/网络失败：保留不可逆事实，从同一context/readback恢复，不重复publish。
- Publication成功但dev provenance reconciliation、Activation、Environment Cleanup、Diagnostics或必需closeout失败：保持同一active协调Task，按lifecycle recovery identity恢复对应owner，不撤销Delivery/Publication、不写入dev、不重跑Candidate或创建resume Task。
- 发布后发现产品问题：RC发布新prerelease，GA发布patch，必要时deprecate或明确移动dist-tag；不默认unpublish。

## 8. 完成报告

报告：

- 类型、version、release identity、dev baseline、selection chain、release HEAD/tree；
- Candidate generation/source、aggregate、唯一tarball filename与integrity、各shard/timing和重跑范围；
- release/support Tasks、Environment、Development/Finish/self-bootstrap correlation与各正交状态；
- release→main PR、main commit/tree、publication context/run/approval、tag/npm/dist-tags/GitHub Release/Registry smoke；
- post-publication dev provenance reconciliation identity、dev baseline/source commits/current dev HEAD和`published-but-dev-reconciliation-blocked`等独立attention；
- local Task Environment、generation carrier、本地selection/worktree资源、正式远端release ref保留核验和可选删除授权事实；
- 当前缺失owner/read model或迁移Contribution；未齐备时明确`release-model-implementation-incomplete`。

不要把“PR已创建”“tag已推送”“workflow已启动”单独视为完成；也不要因后续维护失败撤销已经成立的Delivery或Publication。
