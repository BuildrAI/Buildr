# Buildr npm 发布流程

本文描述canonical发布契约、已经实现的验证/发布基线和当前迁移状态；正式release transaction及其中的tag、`npm publish`和GitHub Release mutation仍需独立发布授权。

`release-<version>`人工选择集合、release HEAD Candidate、Task correlation、共享readiness、release→main和发布后dev provenance reconciliation均已由current Product实现。发布Skill仍须逐项回读owner identity；任何能力缺失或漂移都返回`release-model-implementation-incomplete`，不得回退到“最新dev自动成为发布集合”、旧history bridge或main→dev merge。

## 唯一事实链

1. 维护者从可由current `dev`证明的精确baseline创建唯一`release-<version>`；后续只纳入维护者明确选择且带`-x` provenance的`dev` commit。没有`sourceDevCommit`的release-only metadata必须有独立可验证的dev回流证据，current owner不支持时拒绝。普通`dev`前进不改变release，冲突不自动解决。每次freeze另以不可变`freezes/<generation>` ref保存历史source；frozen不能直接update。
2. 唯一身份链为`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → generation carrier → main tree → post-publication dev provenance reconciliation → closeout → transaction evidence`。每个节点由专业owner提供current identity/read model；任一上游变化使下游evidence stale。Candidate在任何公开mutation前失败且需要修复时，release workflow保持同一协调Task，先从current dev创建或复用窄support Task并完成Development/Verification/Finish交付；回读GitHub、tag、npm与GitHub Release证明尚未publication后，维护者才可显式`reopen --confirm --reason`，再把matching delivered dev commit逐个update、refreeze并对新SHA运行完整Candidate。不得直接在release worktree修复再回灌dev；已存在公开事实时必须使用新version。
3. `release-<version>`是覆盖selection、Candidate、唯一tarball、release→main、readiness、Publication、dev provenance reconciliation与必需closeout的唯一协调Task，在lifecycle `closed`前保持active/blocked。需要在Candidate前交付的version、CHANGELOG、README、测试或owner修复使用基于current dev的窄support Task完成Development/Verification/Finish与适用self-bootstrap并先交付dev，再以`cherry-pick -x`选择进入既有release；support terminal不使release Task completed。Release Task Environment以Buildr Service的`buildr.npm-ci` preparation recipe准备依赖，并在Receipt保留Plan、declaration、recipe、Service lockfile与精确Node identity；不恢复旧worktree，不在Product根运行`npm ci`。Task/Environment/Development/Finish/self-bootstrap只提供各自current read model，release correlation不复制专业Result或建立旁路SQLite store。
4. current release HEAD/tree上的分布式`Candidate gate`证明完整源码候选：复用现有preflight、macOS core、Windows runtime/Launcher、Workspace/Task、fresh build和四个Host Node tuple的primary owner、bounded scheduling、heartbeat/checkpoint与timing。release内容产生新SHA后必须形成新Candidate；普通changed/affected反馈不是完整Candidate。
5. Candidate只生成一个绑定release source的tarball；application payload、npm staging、Host Node、Launcher、publish和Registry readback消费同一filename、SHA-256、SHA-512 integrity与manifest。正式publish不重跑完整Candidate、不重新pack或生成第二份可发布bytes。
6. Candidate通过后为每个selection generation创建或复用确定性`codex/release-main-<version>-g<generation>`中间载体，并只从该carrier创建一个release→main受保护PR；正式远端`release-<version>`不承担PR carrier职责。允许squash后commit identity不同，但`main^{tree}`必须等于冻结release tree。维护者尚未授权正式发布时，transaction runner默认只生成closed context与分阶段collect-all readiness，返回hosted deferred checks与`effects: []`；lifecycle进入`awaiting-publication-authorization`且协调Task保持active。
7. 维护者对current frozen context明确授权后，runner才显式dispatch一次唯一protected workflow。Workflow从matching Candidate run下载并验证aggregate与`candidate-package`，所有Host Node、Launcher和protected consumer复用同一tarball bytes，不重建payload或重新pack；可逆门禁通过后请求一次`npm-production`审批，同一approved execution完成OIDC proof、final pre-tag convergence、tag ensure、同一tarball publish、dist-tag、GitHub Release与Registry安装readback。Terminal evidence按run/attempt保留逐步事实。发布成功后运行`reconcile-dev`，只读核验matching Publication、current frozen selection、正式release/main refs，以及baseline和全部`sourceDevCommit`仍由current remote dev包含；结果`effects: []`，不读取merge policy、不要求main成为dev祖先、不创建worktree/merge/commit/push。来源或identity漂移保留Publication并以稳定recovery identity报告`published-but-dev-reconciliation-blocked`，不得写dev、删除tag或unpublish。随后幂等closeout默认保留并核验正式远端release ref，清理generation carrier、本地selection refs/branch、owned worktree与临时资源；全部通过后lifecycle才`closed`并允许no-change完成唯一协调Task。

## 本机 Launcher 边界

- 普通npm安装默认不修改Applications或Start Menu。只有显式`buildr web launcher install`才创建图形入口。
- macOS Launcher是本机`.app` thin wrapper；Windows Launcher是Start Menu shortcut。两者都精确绑定Host Node executable、npm package entry、prefix、package/payload/protocol identity与target，不复制Node、Buildr package或payload。
- npm更新只原子刷新同installation slot下已经存在且ownership匹配的Launcher。Node、entry、prefix、package或payload漂移时`status`返回invalid/stale，启动和更新fail closed并提示`repair`或重新安装。
- `status`、`repair`与`uninstall`只操作closed binding可证明拥有的目标；foreign target不会被覆盖或删除。Development Launcher保持checkout-backed独立投射。

## 公开位置与恢复

- `@buildr-ai/buildr` tarball只由npm Registry承载；GitHub Release只保存版本说明，不上传Buildr binary Assets。
- Actions artifact只保存冻结candidate与验证evidence，不能作为README、官网、安装脚本或其他公共下载authority。
- `release-evidence-*` artifact中的closed transaction context/evidence正式关联release selection、release/support Tasks、retrospective source、Candidate/publish runs、release/main/dev provenance reconciliation、Environment binding、tag、npm/GitHub Release和Registry smoke。`inspect-run`按publish run下载该artifact，校验digest与GitHub source/run/attempt后返回portable read model并清理临时文件；它不写Task Record、SQLite或旁路store。
- 同一Candidate run重跑失败job时，每个逻辑shard用同名overwrite替换旧attempt evidence；成功shard与唯一tarball继续复用。代码修复产生新source SHA后必须重跑完整分布式门禁，但Windows高成本场景保持三个并行恢复边界。
- 历史`release-<version>` Task若在本生命周期模型生效前被提前completed，保留该terminal记录与Finish事实，不直接改SQLite、伪造reopen或迁移为current。后续version必须以唯一active协调Task和稳定recovery identity恢复，不创建finalize/resume协调Task。
- GitHub Release ensure只核对tag、target commit、notes、draft、prerelease/Latest并拒绝任何binary Asset；Buildr bytes的missing/same/drift恢复只由npm Registry version与integrity决定。
- 已发布version不覆盖。RC问题发布新的prerelease；正式版本问题发布patch，必要时deprecate或移动dist-tag。

## 运行时与更新责任

Buildr npm主进程使用满足`engines.node`的Host Node；Buildr Product checkout使用`.node-version`锁定的精确development Node，Project Verification与Task Environment执行各自显式声明的命令。Release Awareness把`latest`解释为GA正式版、`next`解释为RC候选版，并能区分尚无GA与`latest`类型错误。`buildr update`只根据登记的npm/development identity路由，npm模式使用保存的Host Node、npm CLI和prefix，不从PATH猜测；用户通过`--track stable|candidate`显式选择版本轨道，更新不自动切轨或降级。Buildr升级或Launcher卸载不改变Workspace Registry、SQLite或Workspace data。

规范行为以canonical release、payload、npm package、Launcher与update specs为准；实际发布步骤与授权核对见`services/buildr/docs/release-checklist.md`。SEA、PKG/MSI和正式桌面签名设计只作为已归档历史知识，未来恢复必须由新的产品决策与Change重新建立当前契约。
