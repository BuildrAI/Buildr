# Buildr 发布检查清单

本文用于区分“Buildr 产品 MVP 已完成”和“公开发布前还需要补齐的事项”。MVP 完成表示本地产品闭环成立；公开发布需要额外的开源、分发和示例材料收口。

`package check/build` 是 Buildr 产品 maintenance 命令。OpenSpec 新路径只使用 `converge` 与只读 `audit`；历史阶段命令仍可兼容执行，但必须返回弃用信息且不得有当前产品消费者。该分类描述产品用途，不是权限或安全限制。

## 已完成 MVP

- Buildr root-as-Organization workspace 初始化。
- Project registry、Project 资产骨架创建，并默认内嵌 OpenSpec。
- 本地路径或 Git URL service repo 接入，并维护 project `services/manifest.yml`。
- `doctor --agent <agent> --json` 输出面向当前 Agent runtime 的 Agent-readable 诊断结果。
- `commands add/remove/check` 维护 root 级命令行工具清单。
- `component list/check/install/uninstall` 管理 workspace 级统一生命周期资产；OpenSpec Component、嵌套 Commands collection、Buildr 自有契约门禁 sidebar 与声明式 Skill Contribution 已纳入 package 与 E2E 验证。
- `buildr openspec converge` 产品化执行 OpenSpec change 的规划、隔离验证、条件应用、确认与仅移动归档；`buildr openspec audit` 只读解释状态不明，fixture corpus 同时覆盖并行冲突、文件漂移和历史入口弃用兼容。
- `skills add/remove` 只维护 workspace Skill source；`skills render --destination workspace|user` 显式选择 runtime destination，Project 只保存 capability/applicability context。
- Skill Contribution 只在 runtime render 时组合自然语言 fragments；检查安装后注入、卸载后移除、通用 Skill 源不变，以及无效 slot/integrity fail closed。
- `skill install <agent>` 为七个 supported adapters 安装 Buildr 产品内置 Agent Skill。
- `sync <agent>` 同步 Buildr 产品能力并准备当前 Agent 的 workspace 入口 runtime。
- `rules render`、`runtime check` 和 `skills render` 支持当前 adapter 主路径。
- Supported runtime adapter 由静态 registry 和声明式 RuntimePlan contract 管理；Component 必须验证自身完整性但不能扩展 adapter。
- `package check` 和 `package build` 校验、构建 Buildr 产品随包资产。
- `npm run test:focus -- package-<static|workspace|commands|rules|skills|runtime>` 用于维护期间定点重跑 package verifier；正式任务交付由 `product.delivery` 选择 affected/full，Release 准备再显式运行 `test:candidate` 完整回归。
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
- [ ] 在 Linux Node 24.15.0/24.x 完整验证，并在 Linux/macOS/Windows Node 24.15.0 验证正式 tarball 生命周期（切换 Node 基线后待 CI 重跑）。
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
npm run test:focus -- integration-candidate-recovery
npm run test:focus -- integration-candidate-release
npm run coverage:unit -- --summary /tmp/buildr-unit-coverage.json
```

已知改动路径时优先让统一 planner 自动选择受影响 DAG。无路径时读取当前分支相对 upstream（fallback `origin/dev`）以及 staged、unstaged、untracked 改动；`--plan` 只解释计划，`--json` 输出机器可读计划。完整 Unit 因低成本可覆盖全部 `src/**`；重型 Integration/System step 的 inputs 只登记直接实现、入口、测试和资产 owner，不以“最终可由 CLI 到达”为由扩大选择。普通文档改词通常只运行 docs quality；未映射路径直接失败，要求补 owner，不能静默跳过。registry、planner、runner、声明或 timing 等全局 owner 变化时，同一个 Changed plan 扩展为完整回归：

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

显式完整回归自动选择 `local` 或 `ci` execution profile，并在 timing summary 记录 global/class/resource 上限、step 时间线和 queue duration。性能预算只产生 warning，不把正确性通过改成失败；调度实验可显式设置 `BUILDR_VERIFICATION_PROFILE=ci-workspace-limited`，但发布使用登记的默认 profile。

开发期间需要复现跨组件 workspace 生命周期问题时，通过同一个 focus 入口定点运行独立 Workspace E2E suites：

```bash
npm run test:focus -- workspace-lifecycle
npm run test:focus -- ownership-recovery runtime-reconciliation
```

正式任务在所有 rebase、冲突解决和内容修改结束后，通过 Task Verification 对最终冻结 Candidate 执行 delivery-required `product.delivery`。普通任务由 changed planner 运行 affected；全局验证 owner 变化时同一 plan 运行 full。Release、用户明确全量要求和 CI/publish 另行调用以下显式完整回归兼容入口：

```bash
npm run test:candidate
```

Product delivery/full 验证会把每个阶段和总耗时写入 `BUILDR_TIMING_OUTPUT` 指定的 JSON 文件；未显式指定时，每次 Candidate/Changed run 都在系统临时目录创建唯一 evidence 目录，其中包含 `timing.json` 和 diagnostics，结束时直接打印绝对路径，不维护可被并发覆盖的固定 `latest` 文件。summary 的 `evidenceLifecycle` 将这类目录标记为 `transient`、`consumer-finished` 后可清理并提供精确 `cleanupReference`；它只在当前任务 consumer 使用期间保留，不是长期证据库。显式设置 `BUILDR_TIMING_OUTPUT` / `BUILDR_DIAGNOSTICS_OUTPUT` 时标记为 `caller-managed`，由调用方保证路径唯一并决定保留期，CI 总是上传这些证据。summary 还记录 run kind/id、来源仓库与 Product root、HEAD、branch、dirty、候选 fingerprint、每个 step 日志路径以及 Node、平台、架构和 CI 环境。Workspace E2E 直接运行失败时默认保留失败 fixture 并打印位置，成功时清理；需要主动保留成功 fixture 时可设置 `BUILDR_WORKSPACE_E2E_KEEP=1`。

Candidate 总耗时、Workspace E2E suites 和已识别的高耗时专项阶段声明目标预算；summary 使用 `budgetMs` / `budgetStatus` 标记目标内或超预算，超预算只输出 warning。0.1 不因环境波动或单纯超出目标预算阻塞发布。

完成报告必须读取正式 delivery plan 的 timing summary；运行显式完整回归时也读取对应 Candidate summary。两者都要核对 status、run kind 和 source identity 与最终候选一致，并说明总耗时、预算状态、最慢阶段、失败阶段（成功时为 none）、retention 和 cleanup status。Focus summary 不得替代正式 delivery；不得把并行 step duration 相加推算整体 wall-clock。分析并行 full 性能时，使用 step 的 `queuedAt`、`startedAt`、`finishedAt` 和 `queueDurationMs` 区分调度等待与 executor 执行耗时；blocked step 读取 `blockedAt`，不得把 `durationMs: 0` 解释为已执行。

Buildr Product transient evidence 在 Task Finish 捕获摘要、完成集成与推送且没有后续 consumer 后，使用 `node test/verification/timing/cleanup-evidence.mjs <timing-summary.json>` 清理。该入口只接受位于系统临时目录、名称匹配当前 run kind、summary 归属一致且不是符号链接的精确 evidence 目录；caller-managed evidence 和边界不明路径会 fail closed。

调度性能回归可在同一冻结 tree 上交替运行默认 cost 模式与 `BUILDR_VERIFICATION_SCHEDULING=declaration npm run test:candidate`；timing summary 的 `environment.schedulingMode` 标识实际模式。只按多轮总墙钟和关键 step queue/duration 中位数调整 `schedulingCostMs`，不得用 `dependsOn` 固定建议顺序。

Product 验证能力、旧 MVP 覆盖迁移与必要交叉以[验证覆盖职责矩阵](../../../docs/verification-ownership.md)为维护依据；发现重复时先确认主 owner，再迁移或删除断言。

## npm Release 流程

1. 日常改动集成到 `dev`；准备 `<version>` 前 fetch 并记录最新 `origin/dev` 为不可变 candidate base，再从该 commit 创建 `release-<version>` task id、`tasks/release-<version>` 分支和 `<workspace-root>/.worktrees/release-<version>` canonical worktree。需要排除 dev 内容时先在 dev 独立撤销，不得从旧 ancestor 挑选发布候选。新建发布 worktree 后先在 `projects/product` 执行 `npm ci`，成功后才修改版本和发布材料。
2. 根 `CHANGELOG.md` 必须包含唯一的 `## <version> - <YYYY-MM-DD>` 章节和非空正文。冻结候选前从 workspace root 运行 `node projects/product/services/buildr/scripts/release/release-notes.mjs <version> CHANGELOG.md`，预览 GitHub Release 将使用的最终 Markdown。
3. 对冻结候选完成完整验证并记录 candidate tree identity；release task 必须先通过 task-finish fast-forward 集成到 `dev`，再运行 `release-convergence.mjs --stage pre-main`。通过 PR 将 `dev` squash merge 到 `main` 后，只有 main/dev version 与 tree 均匹配候选时才运行带 `--version` 的 history bridge，随后运行 `--stage post-main` 证明 main 已是 dev ancestor。任一 base、version、tree、task ref、远端竞争或 push finding 都停止 tag 动作。
4. package version 与 Git tag 必须完全一致。当前准备的 `0.1.0-rc.7` 将对应 `v0.1.0-rc.7` 和 `next`；稳定版 `0.1.0` 对应 `v0.1.0` 和 `latest`。
5. 首个 `@buildr-ai/buildr` package 已由 npm Organization owner `elevenching2` 使用 2FA 执行 `npm publish --access public --tag next`，于 2026-07-13 完成。
6. npm trusted publisher 已配置为 GitHub user `elevenching`、repository `Buildr`、workflow `publish.yml`、Environment `npm-production`、allowed action `npm publish`。
7. 后续发布只由 release tag 触发 GitHub-hosted workflow；workflow 在 registry write 和 npm publish 前使用同一提取器生成临时 notes file，缺失、重复或空的目标版本章节会 fail closed。Environment 人工批准后运行完整验证、候选安全检查、publish，并使用该 notes file、已有远端 tag 和正确 prerelease/Latest 状态创建 GitHub Release。
8. 已发布版本不覆盖。RC 问题发布新的 prerelease；正式版本问题优先发布 patch，必要时 deprecate 或移动 dist-tag，不把 unpublish 当作常规回滚。
9. tag、npm version/dist-tag、GitHub Release 和安装 smoke 全部验证成功后，查询远端 `tasks/release-<version>`。如存在，先展示 ref、commit 和稳定发布证据并取得用户明确授权，再删除并复核远端 ref 不存在；未授权或清理失败只记录 follow-up，不回滚或重做发布。

`0.1.0-rc.1`、`0.1.0-rc.2`、`0.1.0-rc.3` 和 `0.1.0-rc.5` 已完成 npm 发布和 GitHub prerelease 创建；`0.1.0-rc.4` 因发布范围错误已弃用；`0.1.0-rc.6` 继续使用同一 trusted publishing 流程，发布事实以 npm 官方 registry 和对应 GitHub prerelease 为准。后续发布仍需每次具有明确发布意图。

实际自举 workspace 如需消费新版产品资产，可独立执行 sync，并在状态变更后运行当前 Agent doctor；CLI update 只更新当前 Product checkout 或 registry package。这不是第二轮产品 E2E。上述验证只证明当前本地产品包和 MVP 主路径成立；公开发布仍需要完成上面的发布材料和分发流程。

使用`task-finish`自动收尾时，必须先由`task-development`完成OpenSpec/current knowledge/runtime内容fixed point，观察stable Content Target，形成verification policy，并在Candidate freeze前执行formal Task Verification。Verification target/declarations current且policy facts完整后冻结Task Candidate，Completion Review绑定Candidate，再由Development记录proceed/必要风险接受并固化current handoff。Finish的`preflight`只聚合handoff/Environment/target/retained问题；`prepare`区分任务贡献（Task Contribution）与交付基线（Delivery Baseline），只在run-owned isolated carrier把原贡献机械应用到最新基线；`verify`只证明contribution/baseline/carrier与handoff等价且formal Verification执行次数为0。target前进时先证明carrier ancestry和全部changed-path after state；完整包含则跳过重复transition，否则凭精确产品token重建isolated carrier。两者都不增加Candidate generation、不重跑Verification/Completion Review；冲突、贡献漂移、不等价或无法证明时必须终止run并返回Development。不得在Finish中converge/archive、rebase原Task、修改贡献、生成Candidate、自动解决冲突或force push。
