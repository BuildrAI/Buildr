---
name: buildr-release
description: 准备、检查、发布和验证Buildr候选版或稳定版时使用，覆盖release-<version>人工选择集合、release HEAD Candidate、唯一tarball、受保护发布事务、release到main和发布后main到dev收敛、失败恢复与发布后验证；用户提到准备发布、发布RC、发布候选版、发布稳定版、检查是否可发布、继续或排查Buildr发布时触发。
---

# Buildr Release

本Skill只编排Buildr自举workspace的产品发布，不作为Buildr内置能力分发。发布事实以current repository、Task/Environment/Development/Finish/self-bootstrap公开read model、GitHub、npm官方registry和实际workflow状态为准，不把示例版本、聊天摘要、checklist勾选或历史stdout当成current authority。

## 1. 解析意图与授权

先固定一种意图，不在阶段之间自动升级：

- `检查候选版|检查稳定版`：只读检查release集合、版本、Candidate、artifact、Task correlation、main、workflow和公共事实；effects必须为空。
- `准备候选版|准备稳定版`：创建或更新人工选择的`release-<version>`，形成matching Candidate与唯一tarball，经受保护PR收敛到`main`，停在正式release workflow dispatch/tag/npm审批之前。
- `发布候选版|发布稳定版`：只在matching准备事实成立后dispatch唯一protected transaction，跟踪tag/npm/GitHub Release/Registry readback，并在Publication成功后收敛main→dev。
- `继续发布|排查发布`：先回读全部owner和公共事实，从可证明中断点继续；不得重复已成功的不可逆步骤。

候选版与稳定版是不同授权。类型、版本、baseline或待选择commit不唯一时停止确认；不得默认稳定版、最新`dev`或全部未发布commit。

## 2. 发布模型实现就绪门禁

在任何release branch、PR、workflow、tag或npm写入前，确认当前Product已提供并能回读以下五类current能力：

1. release selection/provenance：精确dev baseline、ordered selection chain、release HEAD/tree、create/update/freeze/abandon/cleanup结果；
2. release-source Product Candidate：matching release source、Candidate generation、完整required owners与唯一tarball manifest/integrity；
3. release Task correlation：release/support Tasks、Environment、Development handoff、Finish Delivery和self-bootstrap的closed portable关联；
4. shared readiness/protected transaction：同一context digest、collect-all findings、effects为空的local检查与唯一publish workflow；
5. release→main、Publication后main→dev与release branch closeout：tree equality、dev新内容保留和独立cleanup授权。

当前P0只建立release集合契约；若任一后续owner/read model尚未实现或无法证明current：

- 检查意图返回`blocked: release-model-implementation-incomplete`，列出缺失owner和对应Parent Contribution；
- 准备、发布、继续意图在任何Git/PR/workflow/public副作用前停止；
- 不运行旧“冻结最新dev→创建dev→main PR→发布前main→dev bridge”流程；
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
- selection chain只含明确选择且带`-x`provenance的dev commits与明确授权release-only metadata；release不自动追随dev；
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
2. 创建或复用唯一`release-<version>` Task/Environment。只由ready的`service:product/buildr/buildr.npm-ci` recipe在Buildr Service root准备依赖，使用Receipt的exact Node/CLI；不得在Product根`npm ci`。
3. 通过release selection owner创建或核验唯一`release-<version>`集合。create不隐含push；同版本identity冲突时停止。
4. 对维护者明确列出的commit逐个执行selection update；只允许`cherry-pick -x`。冲突立即停止，保留可诊断现场，不自动解决、继续、rebase、reset、force push或直接编辑冒充选择成功。
5. 通过正式Task维护version、CHANGELOG、README/known limitations/checklist等release-only metadata；其commit、scope与授权必须在selection read model中与selected dev commits区分。
6. 运行changed/affected开发反馈并读取timing；它不等于完整Candidate。适用Task按正式Development/Verification/Finish闭环交付，matching self-bootstrap仍由唯一runner完成，失败不改写Delivery。
7. Freeze current release HEAD/tree与selection chain；任一内容变化使旧freeze、Candidate、artifact、readiness和context stale。
8. 对该release source运行GitHub分布式`Candidate gate`；aggregate必须绑定同一source SHA/tree、registry、唯一tarball、macOS/Windows/Host Node evidence。单个job绿色不能替代aggregate。
9. 创建唯一release→main受保护PR。新commit形成新release SHA后必须重新运行完整Candidate；同SHA暂态失败只重跑失败job和aggregate。
10. merge后核验`origin/main^{tree}`精确等于冻结release tree。commit identity可因squash不同，tree不一致或remote race立即停止。
11. 执行shared readiness，只读取selection、Candidate/artifact、Task correlation、main/workflow/authority facts，要求`effects: []`；不得本地模拟OIDC、审批、tag、npm或GitHub Release。
12. 报告“准备完成，尚未dispatch正式release transaction，尚未创建tag/npm version/GitHub Release，尚未请求`npm-production`审批”，然后停止。

## 6. 发布版本

只有用户明确授权对应RC或GA后执行：

1. fetch并重新核验current release HEAD/tree、main tree、Candidate generation、tarball manifest/integrity、Task correlation、readiness context和workflow digest全部matching。
2. 首次发布确认tag/npm version/GitHub Release不存在；恢复路径核对已有事实与同一context/tarball，不删除或覆盖。
3. 使用release Task Environment保存的exact Node启动唯一transaction runner；只dispatch一次`publish.yml`并定位同一run，本机不创建/push tag、不dispatch probe-only workflow。
4. read-only jobs验证contract/context/Candidate/唯一tarball/Host Node/Launcher；全部通过后唯一protected job请求一次`npm-production`审批。
5. 审批后同一job完成OIDC proof、final pre-tag convergence、tag ensure、Registry snapshot、`npm publish <same-tarball>`、双dist-tag/integrity readback、GitHub Release ensure和官方Registry精确安装smoke。
6. 已存在npm version只在integrity与manifest相同、tag/source/context匹配时复用；否则停止，不unpublish、不覆盖、不重新pack。
7. 按publish run inspect `release-evidence-*`，核验selection、release/support Tasks、Candidate、main、publish、tag、npm/GitHub Release、Registry smoke与context digest；临时下载立即清理。
8. Publication成功后才执行main→dev收敛。必须保留release创建后进入dev的新内容；冲突或remote race返回`published-but-dev-convergence-blocked`，不得`ours`、reset、force push或撤销Publication。
9. Task Environment cleanup与release branch cleanup分别走owner。远端release branch删除必须展示精确ref/commit和公开事实，并再次取得独立授权；未授权时保留并报告follow-up。

RC不得主动移动`latest`；GA确认`latest`指向目标稳定版并只报告`next`现状，不擅自删除或移动非目标tag。

## 7. 中断与失败恢复

- release内容变化：旧Candidate/artifact/readiness/context全部stale，形成新generation和唯一tarball，不拼接旧evidence。
- selection冲突：保持pre-operation identity和冲突现场，停止后续选择/remote/public mutation；只在维护者作出新决定后恢复。
- release→main tree不一致或remote race：停止publication，不用历史形状、`ours`、reset或force push掩盖。
- protected transaction已创建tag后失败：保留tag和同run事实，按matchingcontext恢复；不删除tag后重发。
- npm version已存在：先比较official registry integrity与manifest；一致才恢复后续readback，不一致fail closed。
- GitHub Release已存在：核对tag target、notes、prerelease/Latest；一致才复用，不自动覆盖。
- publish或Release成功但smoke/网络失败：保留不可逆事实，从同一context/readback恢复，不重复publish。
- Publication成功但main→dev、Activation、Environment Cleanup、Diagnostics或remote release branch cleanup失败：分别报告owner状态，不撤销Delivery/Publication。
- 发布后发现产品问题：RC发布新prerelease，GA发布patch，必要时deprecate或明确移动dist-tag；不默认unpublish。

## 8. 完成报告

报告：

- 类型、version、release identity、dev baseline、selection chain、release HEAD/tree；
- Candidate generation/source、aggregate、唯一tarball filename与integrity、各shard/timing和重跑范围；
- release/support Tasks、Environment、Development/Finish/self-bootstrap correlation与各正交状态；
- release→main PR、main commit/tree、publication context/run/approval、tag/npm/dist-tags/GitHub Release/Registry smoke；
- post-publish main→dev结果和`published-but-dev-convergence-blocked`等独立attention；
- local Task Environment与local/remote release branch cleanup事实、独立删除授权和未完成follow-up；
- 当前缺失owner/read model或迁移Contribution；未齐备时明确`release-model-implementation-incomplete`。

不要把“PR已创建”“tag已推送”“workflow已启动”单独视为完成；也不要因后续维护失败撤销已经成立的Delivery或Publication。
