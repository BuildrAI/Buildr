# Buildr npm 发布流程

本文描述已经实现的发布能力边界；创建tag、`npm publish`、GitHub Release mutation或推送仍需独立发布授权。

## 唯一事实链

1. npm-only release contract绑定`v<version>`、source commit、dist-tag、`engines.node`、协议identity、CHANGELOG release notes与唯一`publishAuthority`。Authority tuple固定provider、GitHub repository、workflow filename、Environment和allowed npm action；contract不声明Product Node、SEA、installer、平台矩阵或binary Assets。
2. 一次application payload build冻结runtime bundle、Worker bundle与resource inventory，产生稳定`applicationPayloadDigest`。npm staging消费并逐项验证同一manifest。
3. workflow只执行一次`npm pack`，冻结tarball filename、size、SHA-256、SHA-512 integrity、inventory与release artifact manifest；每个Host Node runner显式消费同一artifact中的tarball、`npm-pack` metadata和manifest，Launcher、publish和Registry readback继续复用该bytes。跨attempt恢复只接受与contract/payload完全一致的冻结candidate。
4. `dev → main`的源码候选由分布式`Candidate gate`证明：preflight先短路，唯一PR tarball绑定精确source SHA，macOS core、三个Windows高成本shard和四个Host Node tuple并行，aggregate只接受current closed evidence。普通发布准备默认复用changed/affected反馈，不在本机重复完整Candidate；验证系统自身变化或诊断时才额外运行本地完整入口。
5. 在任何公开写入前，候选必须通过完整CLI、普通CLI不启动HTTP、`buildr web --no-open`与health/readiness、Host Node/Workspace Node角色分离，以及macOS/Windows本机Launcher lifecycle验证。
6. `dev → main`合入并完成`main → dev`历史衔接后，准备阶段只运行`post-main` source convergence，验证version、tree、ancestry、branch protection与远端竞争，不dispatch hosted authority probe，也不请求`npm-production`审批。只有维护者明确授权正式发布后，本机runner才紧邻tag创建针对当前`origin/main`与workflow digest dispatch同一`publish.yml`的唯一手动authority probe。Probe在`npm-production`Environment中以GitHub OIDC身份对目标package完成token exchange，但不创建tag、不pack/publish，且不保留任何token；本机preflight通过GitHub current API复核唯一run与credential-free artifact。只有绑定commit、workflow bytes、package和run，且在15分钟内消费的v2 `ready` evidence能进入`pre-tag` convergence；exchange拒绝、过期、unavailable或drift都停止，不用本机npm session、`npm trust list`、历史provenance或checklist代替。
7. 可逆门禁通过后才允许进入`npm-production`Environment。目标version缺失时发布冻结tarball；已存在时只接受相同integrity。OIDC authority相关失败保留原始npm错误和tag，按expected tuple修复current控制面后只rerun hosted workflow。随后有界确认version、dist-tag与integrity，并从Registry安装精确版本重新smoke。

## 本机 Launcher 边界

- 普通npm安装默认不修改Applications或Start Menu。只有显式`buildr web launcher install`才创建图形入口。
- macOS Launcher是本机`.app` thin wrapper；Windows Launcher是Start Menu shortcut。两者都精确绑定Host Node executable、npm package entry、prefix、package/payload/protocol identity与target，不复制Node、Buildr package或payload。
- npm更新只原子刷新同installation slot下已经存在且ownership匹配的Launcher。Node、entry、prefix、package或payload漂移时`status`返回invalid/stale，启动和更新fail closed并提示`repair`或重新安装。
- `status`、`repair`与`uninstall`只操作closed binding可证明拥有的目标；foreign target不会被覆盖或删除。Development Launcher保持checkout-backed独立投射。

## 公开位置与恢复

- `@buildr-ai/buildr` tarball只由npm Registry承载；GitHub Release只保存版本说明，不上传Buildr binary Assets。
- Actions artifact只保存冻结candidate与验证evidence，不能作为README、官网、安装脚本或其他公共下载authority。
- 同一Candidate run重跑失败job时，每个逻辑shard用同名overwrite替换旧attempt evidence；成功shard与唯一tarball继续复用。代码修复产生新source SHA后必须重跑完整分布式门禁，但Windows高成本场景保持三个并行恢复边界。
- GitHub Release ensure只核对tag、target commit、notes、draft、prerelease/Latest并拒绝任何binary Asset；Buildr bytes的missing/same/drift恢复只由npm Registry version与integrity决定。
- 已发布version不覆盖。RC问题发布新的prerelease；正式版本问题发布patch，必要时deprecate或移动dist-tag。

## 运行时与更新责任

Buildr npm主进程使用满足`engines.node`的Host Node；Workspace-owned npm、Verification、Finish adapter与项目命令只使用`.buildr/workspace.yml`声明的精确Workspace Node。`buildr update`只根据登记的npm/development identity路由，npm模式使用保存的Host Node、npm CLI和prefix，不从PATH猜测；unknown fail closed。Buildr升级或Launcher卸载不改变Workspace Registry、SQLite、Workspace data或Workspace Node。

规范行为以canonical release、payload、npm package、Launcher与update specs为准；实际发布步骤与授权核对见`services/buildr/docs/release-checklist.md`。SEA、PKG/MSI和正式桌面签名设计只作为已归档历史知识，未来恢复必须由新的产品决策与Change重新建立当前契约。
