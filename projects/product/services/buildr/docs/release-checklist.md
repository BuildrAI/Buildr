# Buildr 发布检查清单

本文用于区分“Buildr 产品 MVP 已完成”和“公开发布前还需要补齐的事项”。MVP 完成表示本地产品闭环成立；公开发布需要额外的开源、分发和示例材料收口。

`package check/build`是Buildr产品maintenance命令。OpenSpec当前路径只使用`converge`与事务期只读`convergence inspect`；`openspec audit`和历史阶段命令已删除，调用时必须返回unknown-command且不得有当前产品消费者。该分类描述产品用途，不是权限或安全限制。

## 已完成 MVP

- Buildr root-as-Organization workspace 初始化。
- Project registry、Project 资产骨架创建，并默认内嵌 OpenSpec。
- 本地路径或 Git URL service repo 接入，并维护 project `services/manifest.yml`。
- `doctor --agent <agent> --json` 输出面向当前 Agent runtime 的 Agent-readable 诊断结果。
- `commands add/remove/check` 维护 root 级命令行工具清单。
- `component list/check/install/uninstall` 管理 workspace 级统一生命周期资产；OpenSpec Component、嵌套 Commands collection、Buildr 自有契约门禁 sidebar 与声明式 Skill Contribution 已纳入 package 与 E2E 验证。
- `buildr openspec converge`产品化执行OpenSpec Change的规划、隔离验证、条件应用、确认、仅移动归档与事务Receipt release；`buildr openspec convergence inspect`只读解释仍存在的未决事务。fixture corpus覆盖未开始、before、expected、mixed/unknown、archived not-applicable、并行冲突、Receipt release和旧入口unknown-command。Product Candidate通过Archived Change delta重放关联canonical变化，不要求tracked Receipt。
- `skills add/remove` 只维护 workspace Skill source；`skills render --destination workspace|user` 显式选择 runtime destination，Project 只保存 capability/applicability context。
- Skill Contribution 只在 runtime render 时组合自然语言 fragments；检查安装后注入、卸载后移除、通用 Skill 源不变，以及无效 slot/integrity fail closed。
- `skill install <agent>` 为七个 supported adapters 安装 Buildr 产品内置 Agent Skill。
- `sync <agent>` 同步 Buildr 产品能力并准备当前 Agent 的 workspace 入口 runtime。
- `rules render`、`runtime check` 和 `skills render` 支持当前 adapter 主路径。
- Supported runtime adapter 由静态 registry 和声明式 RuntimePlan contract 管理；Component 必须验证自身完整性但不能扩展 adapter。
- `package check` 和 `package build` 校验、构建 Buildr 产品随包资产。
- `npm run test:focus -- package-<static|workspace|commands|rules|skills|runtime>` 用于维护期间定点重跑 package verifier；正式任务交付由 `product.delivery` 选择 affected/full，Release 准备默认复用changed/affected结果，current `release-<version>` HEAD/tree由GitHub分布式Candidate形成正式门禁。
- Buildr mutation 具备严格 identity、scope/ownership 路径保护、atomic writer、workspace transaction、失败回滚和 doctor recovery；package output 使用 receipt/integrity 安全替换。
- bootstrap guide 在 Skill 不可用时提供纯文本兜底入口。

## 开源 TODO

### 必须完成

- [x] 使用 MIT License，并在仓库根目录和 npm package root 补充 `LICENSE`；README 已同步 License 入口。
- [x] 补充 `CONTRIBUTING.md`，说明本仓目录结构、开发命令、验证命令、OpenSpec 变更流程和 PR 要求。
- [x] 补充 `SECURITY.md`，说明漏洞报告渠道、支持版本和敏感信息处理边界。
- [x] 将 `projects/product/services/buildr/package.json` 调整为可打包状态，使用 `0.1.0` 和 MIT metadata。
- [x] 补充 CLI reference，覆盖当前公开命令、参数、典型输出和不支持的边界。
- [x] 准备公开 example workspace，展示 Organization/Root、Project、Service、Rules、Skills 和 runtime 投射的最小路径。
- [x] 完成去私有化检查，覆盖模板、默认目录、归档文档、示例内容、作者信息、URL、邮箱和组织内部术语。
- [x] 建立 GitHub Actions 最小 CI，运行 `projects/product/services/buildr/test/verification/verify-buildr-product`。
- [x] 在同一冻结source SHA上完成至少三轮分布式Candidate：macOS core、Windows runtime/Launcher、Workspace/Task、fresh build，以及macOS/Windows × 最低/当前24.x四个Host Node tuple全部由`Candidate gate`聚合；Node 25及未来主版本须另建适配任务后再加入。冻结SHA `c2a76cde2d39566a2e665dcc7c2a1291c65a89b9`的runs `31719158091`、`31719762961`、`31720456534`全部绿色，总墙钟中位441s。
- [x] 新workflow首次产生绿色`Candidate gate`并完成精确context回读后更新`main` branch protection，只要求该稳定aggregate；随后删除`managed-runtime-candidate (macos-latest)`、`managed-runtime-candidate (windows-latest)`、`current-host-node (macos-latest)`、`current-host-node (windows-latest)`旧contexts。当前保护规则保持`strict: true`，唯一required check为`Candidate gate`且GitHub Actions app id为`15368`。`dev`保留development feedback而不把它声明为完整Candidate。
- [x] 明确 npm registry 发布流程：`@buildr-ai/buildr`、RC 使用 `next`、稳定版使用 `latest`、tag/version fail closed、GitHub Environment 审批和 OIDC trusted publishing。
- [x] 将干净候选快照推到 `BuildrAI/Buildr`，在真实 GitHub runner 通过 CI，并配置 `main`/`dev` branch protection 与 Private Vulnerability Reporting。
- [x] 通过 2FA 首次发布 `0.1.0-rc.1`，随后为 `@buildr-ai/buildr` 配置 GitHub trusted publisher。
- [ ] 完成 RC 试用和反馈收敛后发布 `0.1.0` 稳定版。

### 建议完成

- [x] 补充 `CHANGELOG.md`，持续记录各候选版的发布范围和日期。
- [x] 补充 issue / PR 模板，降低外部反馈成本。
- [x] 补充公开试用指南和已知限制，明确支持的 Agent runtime 与试用范围；反馈渠道随 GitHub repository URL 确定后补链接。
- [ ] 评估是否提供 Homebrew tap、standalone install script 或 release binary。
- [ ] 评估是否需要 `CODE_OF_CONDUCT.md`。

### 当前不作为开源阻塞

- Project/Service Component、其他 Agent runtime adapter、权限裁剪、远程 Component registry、依赖求解和系统级 Hook 仍属于后续能力。

## 发布前验证

开发期间只在单任务后做最小反馈检查，在相关任务组完成后做一次受影响范围验证；不要逐任务运行本节的完整验证。验证命令仍在运行或暂时无输出时继续等待同一进程，不重复启动。

普通任务默认运行兼容名称下的 Quick gate；该入口并行聚合完整低成本 Unit、Component、静态 Contract 和必要静态检查。Registry 同时记录环境足迹、隔离方式与重置负担，并在启动 verifier 前拒绝真实 filesystem 投射、Git、网络、Workspace 生命周期、重复 cleanup 或不满足隔离例外的 Integration：

```bash
npm test
# 等价于 npm run test:fast
```

需要定位 Node test 层级或观察真实 unit coverage 时使用独立入口；coverage summary 是观察证据，不是当前 Candidate 的全局百分比硬门禁：

```bash
npm run test:unit
npm run test:component
npm run test:contract
npm run test:integration
npm run test:system
npm run test:focus -- integration-candidate-release
npm run coverage:unit -- --summary /tmp/buildr-unit-coverage.json
```

已知改动路径时优先让统一 planner 自动选择受影响 DAG。无路径时读取当前分支相对 upstream（fallback `origin/dev`）以及 staged、unstaged、untracked 改动；`--plan` 只解释计划，`--json` 输出机器可读计划。完整 Unit 因低成本可覆盖全部 `src/**`；重型 Integration/System step 的 inputs 只登记直接实现、入口、测试和资产 owner，不以“最终可由 CLI 到达”为由扩大选择。普通文档改词通常只运行 docs quality；未映射路径直接失败，要求补 owner，不能静默跳过。registry、planner、runner、声明或 timing 等全局 owner 变化时，同一个 Changed plan 扩展为完整回归。拥有Git base时，仅package与lockfile三个明确version字段变化按affected选择；依赖、scripts、engines、其他lockfile结构、解析失败以及没有base的显式paths仍保持full：

```bash
npm run test:changed -- --plan
npm run test:changed -- --base origin/dev
npm run test:changed -- docs/buildr-product.md
npm run --silent test:changed -- --json docs/buildr-product.md
```

需要定位失败或人工重跑领域时使用统一 focus 入口。它按 verifier identity 去重 step/group，只展开真实 artifact 依赖，不自动重复 Fast，也不能替代冻结目标的正式 delivery plan：

```bash
npm run test:focus -- --list
npm run test:focus -- group:cli
npm run test:focus -- group:runtime
npm run test:focus -- package-skills
npm run test:focus -- --plan group:openspec
npm run --silent test:focus -- --json release-tarball-smoke
```

显式本地完整回归自动选择 `local` 或 `ci` execution profile，并在 timing summary 记录 global/class/resource 上限、step 时间线和 queue duration。性能预算只产生 warning，不把正确性通过改成失败；调度实验可显式设置 `BUILDR_VERIFICATION_PROFILE=ci-workspace-limited`。

Candidate CI在单个bootstrap job中复用checkout、依赖与Workspace Node，先形成独立preflight evidence，再构建一次绑定精确source SHA的tarball。macOS core按Task lifecycle、Project/Task state、package/runtime/release、CLI/contract四个互斥语义shard运行；Windows runtime/Launcher、Workspace lifecycle、Task workflow、fresh build及四个Host Node tuple并行消费同一registry计划。每个capability都有明显早于job timeout的独立墙钟上限；runner即时输出completion与diagnostic digest，每15秒输出active/elapsed/PID/PGID心跳，超时按owned process group与observed descendants执行TERM→KILL。每个completion原子更新non-aggregate checkpoint，稳定`Candidate gate`仍只接受全部terminal shard的closed evidence，并在macOS checkout上无需`npm ci`聚合source SHA、registry identity、artifact digest和coverage。Host Node和独立Workspace Node identity不得互相替代。

资源受限CI的单个shard仍使用有界并发。产品owned进程、Launcher、Task Environment或Workspace cleanup失败继续阻塞；全部断言和owned cleanup完成后，最外层Windows临时根遇到`EPERM`、`EBUSY`或`ENOTEMPTY`才只warning并保留路径。release smoke与fresh build evidence保存内部阶段耗时，便于定位安装、启动、漂移修复、卸载/Doctor或harness cleanup。

开发期间需要复现跨组件 workspace 生命周期问题时，通过同一个 focus 入口定点运行独立 Workspace E2E suites：

```bash
npm run test:focus -- workspace-lifecycle
npm run test:focus -- ownership-recovery runtime-reconciliation
```

正式任务在所有rebase、冲突解决和内容修改结束后，通过Task Verification对最终冻结Candidate执行唯一delivery-required `product.delivery`。`product.release-artifact-set`只在维护者明确要求独立release诊断时显式选择，不自动与普通delivery叠加。普通任务由changed planner运行affected；全局验证owner变化时同一plan运行full。本地完整入口保留给验证系统自身变化、明确全量要求、诊断或GitHub不可用；普通发布准备不再与GitHub重复执行。current `release-<version>` HEAD/tree以GitHub `Candidate gate`为正式完整源码Candidate，tag发布不重复源码Candidate，而是验证同一release contract下冻结的唯一npm tarball：

```bash
npm run test:candidate
```

同一SHA的暂态失败使用`node tools/release/candidate-failed-shard-retry.mjs inspect --run-id <id> --source-commit <sha>`核验run、source与失败边界，维护者确认后以同参数执行`retry --confirm`，由唯一owner调用GitHub“重新运行失败作业”。每个shard以唯一逻辑artifact名和`overwrite`替换旧attempt evidence，只重跑失败shard及aggregate；新attempt终态必须回读`Candidate gate`以及aggregate中的run/attempt identity。代码修复产生新SHA后旧evidence必须失效并重新运行完整分布式门禁；Windows runtime、Workspace lifecycle、Task workflow与fresh build各自形成并行恢复边界，因此wall-clock由最长shard主导，而不是把它们串成一条长作业。

Product delivery/full 验证会把每个阶段和总耗时写入 `BUILDR_TIMING_OUTPUT` 指定的 JSON 文件；未显式指定时，每次 Candidate/Changed run 都在系统临时目录创建唯一 evidence 目录，其中包含 `timing.json` 和 diagnostics，结束时直接打印绝对路径，不维护可被并发覆盖的固定 `latest` 文件。summary 的 `evidenceLifecycle` 将这类目录标记为 `transient`、`consumer-finished` 后可清理并提供精确 `cleanupReference`；它只在当前任务 consumer 使用期间保留，不是长期证据库。显式设置 `BUILDR_TIMING_OUTPUT` / `BUILDR_DIAGNOSTICS_OUTPUT` 时标记为 `caller-managed`，由调用方保证路径唯一并决定保留期，CI 总是上传这些证据。summary 还记录 run kind/id、来源仓库与 Product root、HEAD、branch、dirty、候选 fingerprint、每个 step 日志路径以及 Node、平台、架构和 CI 环境。Workspace E2E 直接运行失败时默认保留失败 fixture 并打印位置，成功时清理；需要主动保留成功 fixture 时可设置 `BUILDR_WORKSPACE_E2E_KEEP=1`。

Candidate 总耗时、Workspace E2E suites 和已识别的高耗时专项阶段声明目标预算；summary 使用 `budgetMs` / `budgetStatus` 标记目标内或超预算，超预算只输出 warning。0.1 不因环境波动或单纯超出目标预算阻塞发布。

完成报告必须读取正式 delivery plan 的 timing summary；运行显式完整回归时也读取对应 Candidate summary。两者都要核对 status、run kind 和 source identity 与最终候选一致，并说明总耗时、预算状态、最慢阶段、失败阶段（成功时为 none）、retention 和 cleanup status。Focus summary 不得替代正式 delivery；不得把并行 step duration 相加推算整体 wall-clock。分析并行 full 性能时，使用 step 的 `queuedAt`、`startedAt`、`finishedAt` 和 `queueDurationMs` 区分调度等待与 executor 执行耗时；blocked step 读取 `blockedAt`，不得把 `durationMs: 0` 解释为已执行。

Buildr Product transient evidence 在 Task Finish 捕获摘要、完成集成与推送且没有后续 consumer 后，使用 `node test/verification/timing/cleanup-evidence.mjs <timing-summary.json>` 清理。该入口只接受位于系统临时目录、名称匹配当前 run kind、summary 归属一致且不是符号链接的精确 evidence 目录；caller-managed evidence 和边界不明路径会 fail closed。

调度性能回归可在同一冻结 tree 上交替运行默认 cost 模式与 `BUILDR_VERIFICATION_SCHEDULING=declaration npm run test:candidate`；timing summary 的 `environment.schedulingMode` 标识实际模式。只按多轮总墙钟和关键 step queue/duration 中位数调整 `schedulingCostMs`，不得用 `dependsOn` 固定建议顺序。

Product 验证能力、旧 MVP 覆盖迁移与必要交叉以[验证覆盖职责矩阵](../../../docs/verification-ownership.md)为维护依据；发现重复时先确认主 owner，再迁移或删除断言。

## npm-only Release 流程

当前实现状态：P0契约与P1 selection/Candidate/correlation、P2 shared readiness/protected transaction、P3 Git convergence均已进入current Product。发布检查仍必须逐项回读五类owner；任一能力缺失或漂移时返回`release-model-implementation-incomplete`，并在任何Git、PR、workflow或公共副作用前停止。不得继续使用旧“最新dev自动成为候选”或history bridge步骤。

1. 维护者明确或确认目标`<version>`、精确`<dev-baseline>`和有序选择commit；未指定baseline时，release owner先读取并展示current `dev`的精确commit/tree，取得确认后再创建唯一`release-<version>`。后续只接受明确选择且带`-x`provenance的dev commit。没有`sourceDevCommit`的release-only metadata必须有独立可验证的dev回流证据，当前owner不支持时拒绝。普通dev前进不改变release，冲突不自动解决；freeze同时保存不可变`freezes/<generation>`历史ref，frozen不能直接update。
2. 唯一身份链为`dev baseline → selection chain → release HEAD/tree → Product Candidate generation → frozen tarball → generation carrier → main → post-publication dev provenance reconciliation → closeout → transaction evidence`。任一上游identity变化使旧Candidate、artifact、readiness和context stale。
3. `release-<version>`协调Task覆盖selection、完整Candidate、唯一tarball、release→main、readiness、Publication、dev provenance reconciliation与必需closeout，在lifecycle `closed`前保持active/blocked；版本材料、CHANGELOG/README、测试修复或owner修复使用基于current dev的窄support Task完成Development/Verification/Finish并先交付dev，再把delivered commit以`cherry-pick -x`选择到既有release。不得直接修改release再倒灌dev。support terminal、Delivery、Activation、Candidate或readiness通过不使release协调Task completed。release Task Environment只由`service:product/buildr/buildr.npm-ci`在Buildr Service root准备依赖并冻结Plan/declaration/recipe/lockfile/exact Node identities；Task/Environment/Development/Finish/self-bootstrap各自提供current read model，不复制Result或建立旁路store。
4. 所有selection/reopen/freeze/main reconciliation/local cleanup先从active release Task和ready Environment生成closed execution binding；只在matching `codex/release-<version>` Task worktree执行，正式`release-<version>`仅作为受控ref同步。retained primary worktree、其他Task worktree或陈旧branch/HEAD必须在首次Git写入前失败。
5. selection freeze后、Candidate前固定current main。main不是release祖先时，只有main涉及的Product路径均由current dev/release provenance覆盖才创建显式双亲history commit；该commit的tree必须逐字节等于pre-reconciliation release tree。main独有内容必须先由正式Task交付dev，禁止工作树merge、人工解冲突或`ours`。新history commit形成final generation，pre-reconciliation Candidate/tarball即使tree相同也只作为stale历史。
6. 只在final release HEAD/tree运行分布式Candidate owner集合：preflight、唯一tarball、macOS core、Windows runtime/Launcher、Workspace/Task、fresh build和四个Host Node tuple。普通changed/affected反馈不是完整Candidate。随后为final generation创建carrier与唯一release→main受保护PR。Candidate后main前进会使Candidate、tarball、carrier和PR全部stale，必须形成下一generation并完整重跑Candidate。
6. 准备阶段调用`release-orchestration-runner.mjs prepare-dispatch`；编排器复用transaction readiness owner收集selection、Candidate/artifact、Task correlation、Environment/exact Node、main/dev与workflow facts，返回frozen context digest、Release Phase Timeline identity、collect-all findings、hosted deferred checks与`effects: []`。全部current后进入`awaiting-publication-authorization`，release协调Task仍保持active，不dispatch、不请求`npm-production`审批、不模拟OIDC、不创建tag。
7. 维护者对current frozen context明确授权后，调用`release-orchestration-runner.mjs dispatch`并提交expected context digest。编排器重验current readiness；digest漂移时旧授权失效且零远端写入，一致时才调用transaction owner。唯一workflow从matching Candidate run下载并验证`candidate-aggregate`与`candidate-package`，Host Node、Launcher和protected job消费同一tarball bytes；不得重建payload、`npm pack`或形成第二份候选物。可逆门禁通过后唯一protected job请求一次`npm-production`审批，并完成OIDC、pre-tag、tag ensure、npm、双dist-tag/integrity、GitHub Release与Registry安装readback。其他job不持有Environment/write权限。
8. `release-evidence-*`绑定selection、release/support Tasks、Candidate、release/main/dev、publish run/attempt、逐步terminal状态、tag、npm/GitHub Release和Registry smoke；inspect校验同一context/run/attempt，并把失败恢复分类为`same-attempt`、`new-attempt`或`blocked-new-version`，不写Task Record、SQLite或旁路store。
9. Publication成功后运行`release-orchestration-runner.mjs closeout`：按hosted evidence inspect → `reconcile-dev`只读来源核验 → Git closeout → lifecycle closed检查 → retained Task no-change completion → retained Environment cleanup → retained Doctor推进。每步继续由原owner判断成功；来源或identity不可证明时返回`published-but-dev-reconciliation-blocked`或对应owner blocker，保持Publication并返回已成立effects与唯一resume action，不写dev、删tag或unpublish。carrier/local selection cleanup仍需显式授权，正式remote release ref默认保留。
10. 已发布版本不覆盖；RC问题发新prerelease，GA问题发patch。closeout部分成功后重新调用同一action，只恢复未完成owner；Task已terminal但Environment cleanup或Doctor失败时不重新Publication、Git cleanup或Task complete。每次输出`buildr.release-phase-timeline/v1` identity，按可证明时间区分`machine-execution`、`platform-queue`、`environment-approval`与`human-decision`；Candidate按`runId + runAttempt`记录evidence原attempt、rerun scope与aggregate，缺失边界不估算duration。

`0.1.0-rc.1`、`0.1.0-rc.2`、`0.1.0-rc.3`、`0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.0-rc.12`、`0.1.0-rc.14`、`0.1.0-rc.15`、`0.1.0-rc.18`、`0.1.0-rc.19`、`0.1.0-rc.20`、`0.1.0-rc.21`、`0.1.0-rc.22`和`0.1.0-rc.23`已完成npm发布和GitHub prerelease创建；`0.1.0-rc.4`因发布范围错误已弃用。`v0.1.0-rc.9`tag workflow因Host Node checkout验证依赖缺失而失败；`v0.1.0-rc.10`已补齐独立`npm ci`，但两个Host Node jobs未向verifier传入冻结`release-artifact.json`而确定性失败；`v0.1.0-rc.11`修复Host Node wiring后进入publish job，但frozen Application Payload仍把开发仓用户态`.buildr/workspace.yml`当作必需资源，因该源已被正确移除而在任何公共写入前fail closed。rc.12随后移除全部Workspace、Project与Service用户态配置发布源；`v0.1.0-rc.13`的publish job在安装依赖前加载release contract时因间接依赖`yaml`而失败，同样没有执行任何公共写入。rc.14、rc.15、rc.18、rc.19、rc.20、rc.21、rc.22和rc.23均已修复并发布；rc.15将正式发布收敛为单次transaction与一次`npm-production`审批。rc.16通过源码Candidate gate，但发布任务的closeout evidence在后续正式修复任务交付后不再匹配current `dev`，因此没有创建tag、npm version或GitHub Release；rc.17完成正式验证与自举激活后，因rc.16 squash merge的`main → dev`历史衔接缺失导致新PR冲突，同样没有创建任何公开版本。该历史已在保持`dev`内容不变的前提下修复。rc.20首次Candidate因retained cleanup测试入口递归使一个capability不退出；修复后完整Candidate与发布通过，执行器可观测性和发布关联缺口由后续正式Change治理，不把进程采样或runner暂态当作该根因。rc.22首次Candidate run `32729369444`在任何tag/npm/GitHub Release或正式release transaction前失败，修复通过support Task进入`dev`后按受控reopen/refreeze恢复；原协调Task的提前completed作为历史异常保留。当前仓库候选版本为`0.1.0-rc.24`，准备阶段尚未创建tag、npm version、GitHub Release或正式release transaction。

实际自举workspace如需消费新版产品资产，可独立执行sync并在状态变更后运行当前Agent doctor。`buildr update`只按installation receipt更新当前npm package或development checkout；它不更新Workspace Node。上述能力验证不等于已完成tag、publish或GitHub Release mutation。

使用`task-finish`自动收尾时，先由`task-development`完成OpenSpec/current knowledge/runtime内容fixed point，观察stable Content Target、冻结Task Candidate、完成Completion Review并固化current handoff。开发完成后的Task Verification由Agent独立执行和记录，不绑定Candidate，也不由Finish代跑或消费。Finish只聚合当前交付所需的handoff、Environment、target和retained事实；不得在Finish中converge/archive、rebase原Task、修改贡献、生成Candidate、补写Task验证报告、自动解决冲突或force push。
