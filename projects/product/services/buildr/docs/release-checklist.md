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
- `npm run test:focus -- package-<static|workspace|commands|rules|skills|runtime>` 用于维护期间定点重跑 package verifier；正式任务交付由 `product.delivery` 选择 affected/full，Release 准备默认复用changed/affected结果，`dev → main`由GitHub分布式Candidate形成正式门禁。
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
- [x] 建立 GitHub Actions 最小 CI，运行 `projects/product/services/buildr/scripts/verify-buildr-product`。
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

Candidate CI在单个bootstrap job中复用checkout、依赖与Workspace Node，先形成独立preflight evidence，再构建一次绑定精确source SHA的tarball。macOS core、Windows runtime/Launcher、Workspace lifecycle、Task workflow、fresh build及四个Host Node tuple并行消费同一registry计划；只有core、runtime和Host Node真实consumer下载tarball。稳定`Candidate gate`继续在macOS checkout上无需`npm ci`，直接使用pinned Node聚合source SHA、registry identity、artifact digest和coverage全部current的closed evidence。Host Node和独立Workspace Node identity不得互相替代。

资源受限CI的单个shard仍使用有界并发。产品owned进程、Launcher、Task Environment或Workspace cleanup失败继续阻塞；全部断言和owned cleanup完成后，最外层Windows临时根遇到`EPERM`、`EBUSY`或`ENOTEMPTY`才只warning并保留路径。release smoke与fresh build evidence保存内部阶段耗时，便于定位安装、启动、漂移修复、卸载/Doctor或harness cleanup。

开发期间需要复现跨组件 workspace 生命周期问题时，通过同一个 focus 入口定点运行独立 Workspace E2E suites：

```bash
npm run test:focus -- workspace-lifecycle
npm run test:focus -- ownership-recovery runtime-reconciliation
```

正式任务在所有rebase、冲突解决和内容修改结束后，通过Task Verification对最终冻结Candidate执行唯一delivery-required `product.delivery`。`product.release-artifact-set`只在维护者明确要求独立release诊断时显式选择，不自动与普通delivery叠加。普通任务由changed planner运行affected；全局验证owner变化时同一plan运行full。本地完整入口保留给验证系统自身变化、明确全量要求、诊断或GitHub不可用；普通发布准备不再与GitHub重复执行。`dev → main`以GitHub `Candidate gate`为正式完整源码Candidate，tag发布不重复源码Candidate，而是验证同一release contract下冻结的唯一npm tarball：

```bash
npm run test:candidate
```

同一SHA的暂态失败使用GitHub“重新运行失败作业”：每个shard以唯一逻辑artifact名和`overwrite`替换旧attempt evidence，只重跑失败shard及aggregate。代码修复产生新SHA后旧evidence必须失效并重新运行完整分布式门禁；Windows runtime、Workspace lifecycle、Task workflow与fresh build各自形成并行恢复边界，因此wall-clock由最长shard主导，而不是把它们串成一条长作业。

Product delivery/full 验证会把每个阶段和总耗时写入 `BUILDR_TIMING_OUTPUT` 指定的 JSON 文件；未显式指定时，每次 Candidate/Changed run 都在系统临时目录创建唯一 evidence 目录，其中包含 `timing.json` 和 diagnostics，结束时直接打印绝对路径，不维护可被并发覆盖的固定 `latest` 文件。summary 的 `evidenceLifecycle` 将这类目录标记为 `transient`、`consumer-finished` 后可清理并提供精确 `cleanupReference`；它只在当前任务 consumer 使用期间保留，不是长期证据库。显式设置 `BUILDR_TIMING_OUTPUT` / `BUILDR_DIAGNOSTICS_OUTPUT` 时标记为 `caller-managed`，由调用方保证路径唯一并决定保留期，CI 总是上传这些证据。summary 还记录 run kind/id、来源仓库与 Product root、HEAD、branch、dirty、候选 fingerprint、每个 step 日志路径以及 Node、平台、架构和 CI 环境。Workspace E2E 直接运行失败时默认保留失败 fixture 并打印位置，成功时清理；需要主动保留成功 fixture 时可设置 `BUILDR_WORKSPACE_E2E_KEEP=1`。

Candidate 总耗时、Workspace E2E suites 和已识别的高耗时专项阶段声明目标预算；summary 使用 `budgetMs` / `budgetStatus` 标记目标内或超预算，超预算只输出 warning。0.1 不因环境波动或单纯超出目标预算阻塞发布。

完成报告必须读取正式 delivery plan 的 timing summary；运行显式完整回归时也读取对应 Candidate summary。两者都要核对 status、run kind 和 source identity 与最终候选一致，并说明总耗时、预算状态、最慢阶段、失败阶段（成功时为 none）、retention 和 cleanup status。Focus summary 不得替代正式 delivery；不得把并行 step duration 相加推算整体 wall-clock。分析并行 full 性能时，使用 step 的 `queuedAt`、`startedAt`、`finishedAt` 和 `queueDurationMs` 区分调度等待与 executor 执行耗时；blocked step 读取 `blockedAt`，不得把 `durationMs: 0` 解释为已执行。

Buildr Product transient evidence 在 Task Finish 捕获摘要、完成集成与推送且没有后续 consumer 后，使用 `node test/verification/timing/cleanup-evidence.mjs <timing-summary.json>` 清理。该入口只接受位于系统临时目录、名称匹配当前 run kind、summary 归属一致且不是符号链接的精确 evidence 目录；caller-managed evidence 和边界不明路径会 fail closed。

调度性能回归可在同一冻结 tree 上交替运行默认 cost 模式与 `BUILDR_VERIFICATION_SCHEDULING=declaration npm run test:candidate`；timing summary 的 `environment.schedulingMode` 标识实际模式。只按多轮总墙钟和关键 step queue/duration 中位数调整 `schedulingCostMs`，不得用 `dependsOn` 固定建议顺序。

Product 验证能力、旧 MVP 覆盖迁移与必要交叉以[验证覆盖职责矩阵](../../../docs/verification-ownership.md)为维护依据；发现重复时先确认主 owner，再迁移或删除断言。

## npm-only Release 流程

1. 日常改动集成到`dev`；准备`<version>`前fetch并记录最新`origin/dev`为不可变candidate base，再从该commit创建正式release Task、独立分支和worktree。新环境先按Preparation Declaration准备，不从旧ancestor、旧worktree或旧Receipt派生。
2. 根`CHANGELOG.md`必须包含唯一`## <version> - <YYYY-MM-DD>`章节和非空正文；package version、`v<version>`tag、dist-tag、`engines.node`、protocol identity与Release notes必须由唯一npm-only release contract解析且互相一致。Contract不得声明Product Node、SEA、installer、平台matrix或binary Assets。
3. 冻结前完成full Product Candidate、current knowledge与OpenSpec convergence。Release Task Finish交付`dev`后，必须先把matching Finish run交给唯一self-bootstrap runner；只有同一run返回`passed`或带完整plan的`not-applicable`，才能重新读取`origin/dev` tree并把它冻结为pre-main、GitHub Candidate与history bridge的共同候选。`bridge-main-to-dev.mjs`必须消费该run的临时closeout evidence并在任何merge/push前核对schema、Task/run/plan、remote/dev、finalize和live dev ref；不得在bridge后补跑activation，也不得把evidence写入Task、Finish、SQLite或Git。Release contract必须机器可读声明`provider/repository/workflow/Environment/allowedActions`唯一authority tuple；准备阶段完成activation、`dev → main`历史衔接和无hosted evidence的`post-main` source convergence后停在tag前，不dispatch正式transaction、不请求`npm-production`审批。只有维护者明确授权正式发布后，本机才使用`release-transaction-runner.mjs`针对current`origin/main`、version、candidate base/tree与`publish.yml`digest dispatch一次完整workflow；本机不创建或push tag，不另行dispatch probe-only run。
4. workflow的read-only contract/candidate/Host Node/Launcher jobs先构建一次`buildr.application-payload/v1`并只执行一次`npm pack`。tarball manifest冻结filename、inventory、payload digest、SHA-256与SHA-512 integrity；每个Host Node runner依据lockfile独立准备harness，全部smoke显式复用同一bytes。任一可逆门禁失败都不得创建Environment deployment。
5. 可逆门禁全部通过后，唯一`release` job请求一次`npm-production`审批并在同一approved execution中完成credential-free OIDC probe、final`pre-tag` convergence、tag`preflight|ensure`、Registry snapshot、Trusted Publishing、双dist-tag/integrity readback、GitHub Release ensure与官方Registry精确安装smoke。其他job不得声明Environment、`id-token: write`、`contents: write`或tag/npm mutation。
6. Tag不存在时protected transaction创建annotated tag；已存在时只接受最终解析到同一source commit，任何漂移都不得删除、移动或force push。目标npm version缺失时由`trusted-publish.mjs`发布同一tarball；已存在时只接受`dist.integrity`完全相同。`E401`、`ENEEDAUTH`或OIDC/Trusted Publisher相关`E404`必须保留npm原始失败和已有匹配tag，输出expected tuple与“修复current authority→rerun完整transaction”恢复路径，不得回退本机token publish。新的protected attempt仍可能按GitHub规则再次要求审批，不得通过弱化Environment protection规避。
7. GitHub Release只使用metadata ensure语义：不存在时创建，存在时核对tag、target commit、notes、draft、prerelease/Latest；发现任何Buildr binary Asset必须停止。npm tarball、生成的Launcher、payload manifest或内部evidence不得上传为Release Asset。
8. npm tarball只由npm Registry承载；Actions artifact只保存冻结候选/evidence，README、官网和安装脚本不得把它作为公共下载地址。发布后只从Registry下载精确package并核对安装readback。
9. 已发布版本不覆盖。RC问题发布新的prerelease；正式版本问题优先发布patch，必要时deprecate或移动dist-tag。所有tag、Registry与公共安装readback稳定后，远端release Task分支清理仍需独立授权；清理失败只记录follow-up，不回滚已发布事实。

`0.1.0-rc.1`、`0.1.0-rc.2`、`0.1.0-rc.3`、`0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.0-rc.12`、`0.1.0-rc.14`、`0.1.0-rc.15`和`0.1.0-rc.18`已完成npm发布和GitHub prerelease创建；`0.1.0-rc.4`因发布范围错误已弃用。`v0.1.0-rc.9`tag workflow因Host Node checkout验证依赖缺失而失败；`v0.1.0-rc.10`已补齐独立`npm ci`，但两个Host Node jobs未向verifier传入冻结`release-artifact.json`而确定性失败；`v0.1.0-rc.11`修复Host Node wiring后进入publish job，但frozen Application Payload仍把开发仓用户态`.buildr/workspace.yml`当作必需资源，因该源已被正确移除而在任何公共写入前fail closed。rc.12随后移除全部Workspace、Project与Service用户态配置发布源；`v0.1.0-rc.13`的publish job在安装依赖前加载release contract时因间接依赖`yaml`而失败，同样没有执行任何公共写入。rc.14、rc.15和rc.18均已修复并发布；rc.15将正式发布收敛为单次transaction与一次`npm-production`审批。rc.16通过源码Candidate gate，但发布任务的closeout evidence在后续正式修复任务交付后不再匹配current `dev`，因此没有创建tag、npm version或GitHub Release；rc.17完成正式验证与自举激活后，因rc.16 squash merge的`main → dev`历史衔接缺失导致新PR冲突，同样没有创建任何公开版本。该历史已在保持`dev`内容不变的前提下修复，当前仓库正在准备`0.1.0-rc.19`，既有失败tag保持不动。

实际自举workspace如需消费新版产品资产，可独立执行sync并在状态变更后运行当前Agent doctor。`buildr update`只按installation receipt更新当前npm package或development checkout；它不更新Workspace Node。上述能力验证不等于已完成tag、publish或GitHub Release mutation。

使用`task-finish`自动收尾时，必须先由`task-development`完成OpenSpec/current knowledge/runtime内容fixed point，观察stable Content Target，形成verification policy，并在Candidate freeze前执行formal Task Verification。Verification target/declarations current且policy facts完整后冻结Task Candidate，Completion Review绑定Candidate，再由Development记录proceed/必要风险接受并固化current handoff。Finish的`preflight`只聚合handoff/Environment/target/retained问题；`prepare`区分任务贡献（Task Contribution）与交付基线（Delivery Baseline），只在run-owned isolated carrier把原贡献机械应用到最新基线；`verify`只证明contribution/baseline/carrier与handoff等价且formal Verification执行次数为0。target前进时先证明carrier ancestry和全部changed-path after state；完整包含则跳过重复transition，否则凭精确产品token重建isolated carrier。两者都不增加Candidate generation、不重跑Verification/Completion Review；冲突、贡献漂移、不等价或无法证明时必须终止run并返回Development。不得在Finish中converge/archive、rebase原Task、修改贡献、生成Candidate、自动解决冲突或force push。
