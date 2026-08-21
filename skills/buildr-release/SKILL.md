---
name: buildr-release
description: 准备、检查、发布和验证 Buildr 候选版或稳定版时使用，覆盖版本与发布材料更新、dev 到 main 候选收敛、release tag、GitHub Actions、npm dist-tag、GitHub Release、失败恢复和发布后验证；用户提到准备发布、发布 RC、发布候选版、发布稳定版、检查是否可发布、继续或排查 Buildr 发布时触发。
---

# Buildr Release

本 Skill 只编排 Buildr 自举 workspace 的产品发布，不作为 Buildr 内置能力分发。发布事实以当前仓库、GitHub、npm 官方 registry 和实际 workflow 状态为准，不把本文中的示例版本当成当前版本。

## 解析意图与授权

先把用户意图固定为以下一种，不在阶段之间自动升级：

- `检查候选版` 或 `检查稳定版`：只读检查发布条件和阻塞项，不修改文件、分支、tag 或外部状态。
- `准备候选版` 或 `准备稳定版`：形成已验证并进入 `main` 的发布候选；允许维护版本和发布材料、完成开发任务收尾及 `dev -> main` PR，但必须停在创建 tag 之前。
- `发布候选版` 或 `发布稳定版`：在对应准备状态成立后创建并推送 release tag，跟踪受保护发布 workflow，并验证 npm 与 GitHub Release。
- `继续发布` 或 `排查发布`：先查询 Git、GitHub Actions、GitHub Release 和 npm 状态，再从可证明的中断点继续；不得重复已经成功的不可逆步骤。

候选版与稳定版是不同授权。用户只说“发布”但无法从当前上下文唯一确定类型或版本时，停止并确认；不得默认选择稳定版。

## 建立发布事实

1. 从 Buildr workspace root 解析 Product Project，不根据当前目录猜测。
2. 读取 root、Product 与 Buildr Service scope 的 `AGENTS.md`、Buildr Core、`projects/product/services/buildr/docs/release-checklist.md`、`projects/product/services/buildr/package.json`、`projects/product/services/buildr/package-lock.json`、CHANGELOG 和 `.github/workflows/publish.yml`。
3. 检查工作区、worktree、`dev`、`main`、远端、现有 tags、对应 GitHub Releases 和最近 publish workflow。
4. 使用 npm 官方 registry 查询 package 版本和 dist-tags；本机 install 镜像不能替代发布状态事实。
5. 确认当前版本、目标版本、发布类型和预期 npm tag：prerelease 使用 `next`，稳定版使用 `latest`。从 release contract 读取唯一 `publishAuthority`，不得从 checklist 或历史 provenance 重建另一份 tuple。
6. 新发布必须证明目标 package version、Git tag 和 GitHub Release 尚不存在；恢复同一 tag 的中断发布时分别核对已有事实，不把“已存在”直接视为成功或冲突。已经发布的 npm version 不得覆盖或复用为另一制品。
7. 使用 `node projects/product/services/buildr/tools/release/release-notes.mjs <version> CHANGELOG.md` 生成目标版本的最终 GitHub Release notes 预览；目标章节缺失、重复或没有具体内容时视为发布阻塞。

版本不明确时，根据现有版本提出下一合法版本并让用户确认。RC 问题使用新的 prerelease 序号；稳定版本问题使用新的 patch，不把 unpublish 当作常规回滚。

## 检查发布条件

只读检查至少覆盖：

- 目标版本与 tag、npm tag 的映射一致。
- 目标提交可从 `dev` 收敛到 `main`，没有未处理改动或未完成发布范围。
- CHANGELOG、README 当前版本入口、known limitations 和 release checklist 与目标类型一致。
- `CHANGELOG.md` 存在唯一的 `## <version> - <YYYY-MM-DD>` 章节，release notes 提取器输出与目标版本一致且不包含相邻版本内容。
- CI、`npm-production` Environment 和 publish workflow 仍存在；workflow只接受closed正式`workflow_dispatch`输入，只有一个依赖全部可逆门禁的`release` job声明Environment、`contents: write`和`id-token: write`，其他job保持read-only。Current authority只能由该protected transaction内的GitHub-hosted probe对目标package完成npm OIDC token exchange证明；本机npm CLI、登录态、OTP与`npm trust list`不再是前置条件。检查与准备意图只核对该能力结构，不dispatch hosted run；只有用户明确授权正式发布后才启动完整transaction。
- 显式dispatch release workflow只生成一次带manifest/integrity的正式tarball，审批前smoke与protected`npm publish <tarball>`消费同一文件，并且不重复运行完整Candidate。
- `dev → main` 的正式源码 Candidate 由 `verify.yml` 的稳定 `Candidate gate` 聚合；preflight、唯一候选tarball、macOS core、三个Windows高成本shard和四个Host Node tuple必须绑定同一source SHA。内部job成功不能替代aggregate结果。
- 候选版没有误用 `latest`；稳定版没有误用 `next`。
- 稳定版的 RC 反馈、发布阻塞 Issue 和已知限制已经明确评估。

输出 `ready`、`blocked` 或 `already-published`，并列出证据和下一步。检查意图不得顺带修复。

## 准备发布

准备阶段是普通开发任务，遵循 `task-triage`、`task-worktree`、项目验证和 `task-finish`：

1. fetch `origin/dev`，将其 commit 记录为本次不可变 `<candidate-base>`；从不带 `v` 前缀的完整目标 package version 派生发布 task identity：task id 为 `release-<version>`，分支为 `tasks/release-<version>`，canonical worktree 为 `<workspace-root>/.worktrees/release-<version>`，且新 worktree 必须从该 `<candidate-base>` 创建。同一版本已有分支和 worktree时必须检查归属、base 和当前远端状态后复用，不创建第二个发布任务 identity；不得在 `main` 直接准备发布材料。
2. 通过正式 Task Environment `prepare` 取得发布 Task 的 execution root、权威 Node executable、Workspace CLI 和 preparation receipt。不得在 `projects/product` 或其他调用方自选 cwd 直接运行 `npm ci`，不得用会话 PATH 猜 Node。只接受 receipt 中 ready 的 `service:product/buildr/buildr.npm-ci` recipe，要求其 cwd 为 `projects/product/services/buildr`，且 `package.json`、Service `package-lock.json`、declaration、Plan 与 recipe identity 完整；依赖准备只由该 recipe 执行。Environment 未 ready、Service lockfile 缺失或 receipt identity 漂移时停止。
3. 使用无 tag 的版本更新方式同步 `package.json` 和 `package-lock.json`。
4. 更新 CHANGELOG、README 当前发布入口、known limitations 和 release checklist；只记录真实发布范围和仍存在的限制。
5. 从 workspace root 运行 `node projects/product/services/buildr/tools/release/release-notes.mjs <version> CHANGELOG.md`，向维护者展示 workflow 将使用的最终 notes；提取失败或内容仍是笼统发布标题时继续维护 CHANGELOG，不进入候选验证。
6. 确认 lockfile 不因本机 install 镜像写入私有或非 canonical registry URL，`publishConfig.registry` 保持 npm 官方 registry。
7. 先运行changed/affected验证并读取timing summary。普通发布准备不再无条件本地运行完整`test:candidate`；只有verification registry/planner/executor、Candidate shard/evidence/aggregate、`verify.yml`本身发生变化，维护者明确要求全量，或为诊断GitHub故障时，才额外运行本地完整Candidate。此时的Task tree只用于证明Development handoff内容；正式release candidate tree必须在后述self-bootstrap activation完成后从`origin/dev`重新冻结。本地结果不得冒充后续GitHub aggregate。
8. 使用 `task-finish` 把准备改动 fast-forward 集成并推送到 `dev`。release task 如果无法从 `<candidate-base>` 无语义冲突地进入当前 `dev`，必须停止；需要排除已有 dev 内容时，先结束本次准备并在 dev 上通过独立 change/revert 移除，禁止改从旧 dev ancestor 制作候选。
9. 在任何`pre-main` convergence、`dev -> main` PR或history bridge之前，立即把第8步同一会话持有的matching Formal Finish Result交给`buildr-self-bootstrap-sync` Skill的唯一runner。正常路径使用`release-<version>` Task；如果该release Task已经terminal、但后续正式修复 Task 已交付到最新`dev`，只有维护者明确授权的 recovery 才能使用该后续 Task 的 matching Finish Result，不得恢复、伪造或改写旧 release Task/evidence。使用Environment retained Node启动runner，并在操作系统临时目录把结构化stdout保存为`<self-bootstrap-evidence.json>`；不得把evidence写入Workspace、Task、Finish、SQLite或Git。只有结果为同一run的`passed`，或带完整plan的`not-applicable`时才能继续；blocked/failed、foreign recovery、run/Task/ref不匹配或evidence不完整时停止，绝不先bridge再补跑或拆分runner阶段。成功后fetch并重新读取`origin/dev` commit与`origin/dev^{tree}`，将其冻结为唯一`<candidate-ref>`与`<candidate-tree>`；后续所有convergence、PR、Candidate和bridge必须使用该tree。
10. 检查本次发布范围是否涉及 Buildr CLI 入口或实现，包括 `buildr`、`bin/buildr.mjs`、`src/**/*.mjs`、legacy安装/卸载脚本或 npm CLI 映射。若涉及，必须从第9步已经激活且会继续保留的 Product checkout，以该Task Environment绑定的Node显式运行 `projects/product/buildr version --json`、`projects/product/buildr --help` 和 `projects/product/buildr doctor --agent <agent> --target <workspace-root> --json`，核对development channel、source commit、Node和package/version。不得调用`scripts/install-buildr-cli`，不得读取、创建、覆盖或要求PATH默认`buildr`绑定checkout。npm发布身份由候选tarball验证与发布后官方registry精确安装smoke独立证明；两类证据不得互相替代。任一验证失败时停止发布准备，也不得要求维护者去其他workspace通过Agent“更新Buildr”代替本地checkout验证。
11. 从保留 workspace 运行 `node projects/product/services/buildr/tools/release/release-convergence.mjs --repo <workspace-root> --version <version> --candidate-base <candidate-base> --candidate-tree <candidate-tree> --stage pre-main`；只有 `ok: true` 才创建 `dev -> main` PR。checker 必须证明版本提交与适用的self-bootstrap successor已进入`origin/dev`、dev tree等于activation后冻结的候选，并且没有未集成的同版本 release task ref。
12. 创建 `dev -> main` PR，等待稳定required check `Candidate gate`。它必须回读为同一PR head SHA的passed aggregate，并包含preflight、唯一artifact、macOS core、三个Windows shard和四个Host Node tuple的current evidence。单个内部job绿色、旧run或旧SHA不得替代。失败发生在同一SHA的暂态/runner问题时只重新运行失败job；新commit形成新SHA后必须运行完整当前门禁。通过后按仓库策略squash merge到`main`。
13. PR 合入后使用 `node projects/product/services/buildr/tools/release/bridge-main-to-dev.mjs --repo <workspace-root> --version <version> --candidate-tree <candidate-tree> --self-bootstrap-run <finish-run-id> --self-bootstrap-evidence <self-bootstrap-evidence.json> [--self-bootstrap-task <recovery-task-id>]` 执行发布专用历史衔接。未提供`--self-bootstrap-task`时，工具只接受`release-<version>`；恢复路径必须显式传入后续正式 recovery Task ID，并要求临时evidence的run、plan和Task完全匹配。该工具必须在任何merge/push前重新验证closeout schema、passed/not-applicable、matching release/recovery Task/run/plan、remote/dev、finalize与evidence推导的最终dev ref，再确认 `origin/main^{tree}` 和 `origin/dev^{tree}` 都与已验证 candidate tree、两个ref的package version与目标版本一致；`origin/main` 已是 `origin/dev` 祖先时 no-op，否则创建仅衔接历史、不改变 tree 的 merge commit，复核 tree 后普通 push `dev`。缺失、失败、不匹配或已漂移evidence固定零bridge副作用停止。
14. bridge 后运行 convergence checker 的 `--stage post-main`，只证明 base、version、tree、ancestry、release task、branch protection、push 与远端竞争已经收敛；准备阶段不得传入 authority evidence、dispatch正式release transaction、请求 `npm-production` 审批或执行 npm token exchange。该 version/tree gate 失败时不得使用 force push、reset 或 `ours` 掩盖内容差异。post-main通过后精确删除本次系统临时self-bootstrap evidence及其空临时目录；若为诊断或可恢复中断暂时保留，必须报告路径和唯一consumer，放弃恢复时立即删除。
15. 确认 `main` 指向已验证内容，版本和发布材料一致，且远端 `dev` 已包含 squash `main` 历史。
16. 明确报告“准备完成，尚未dispatch正式release transaction，尚未创建tag，尚未触发npm发布或`npm-production`审批”，并在涉及CLI时同时报告retained `projects/product/buildr`的identity与验证结果；不得把它描述为机器默认或npm发布入口，然后停止。

准备候选版时使用 prerelease 版本并声明 `next`；准备稳定版时移除 prerelease 后缀，确认稳定发布日期和 `latest`，并额外复核 RC 反馈是否收敛。

## 发布版本

只有用户明确要求发布对应候选版或稳定版时执行：

1. fetch 远端并确认本地 `main`、`origin/main` 和已准备的候选提交一致；工作区必须干净。
2. 再次执行只读发布检查和`release-authority-preflight.mjs`静态检查。首次发布确认目标npm version、Git tag和GitHub Release不存在；继续中断发布则记录已有tag、npm version/integrity、dist-tag和GitHub Release的精确状态。Preflight必须证明closed dispatch inputs、唯一`npm-production` owner、唯一OIDC/pre-tag/tag/publish调用链与current repository/Environment；它不dispatch、不exchange token、不创建tag。
3. 确认`package.json` version与目标`v<version>`完全一致，并恢复准备阶段记录的`<candidate-base>`与`<candidate-tree>`；缺失或不匹配时停止，不从聊天、旧run或近似Git ref猜测。
4. 从已完成 release Task 的 Environment Receipt 读取同一权威 Node executable，并以其绝对路径启动 `projects/product/services/buildr/tools/release/release-transaction-runner.mjs --repo <workspace-root> --version <version> --candidate-base <candidate-base> --candidate-tree <candidate-tree> --source-commit origin/main --release-task release-<version> --candidate-run-id <candidate-run-id> --dev-commit origin/dev [--support-tasks <task-id,...>]`。Runner同时把该 Node bin置于子进程PATH首位，核对父子 Node identity；它通过 Application read model读取completed release/support Tasks、retrospective sources和Task Environment Plan/Receipt，要求权威Service recipe与冻结source lockfile identity一致。Runner只对current`origin/main`dispatch一次`publish.yml`并定位同一run。本机不得创建或push tag，也不得另行dispatch probe-only run。
5. workflow先完成contract、唯一正式tarball、Host Node和Launcher可逆验证。只有这些jobs全部通过后，唯一`release` job才请求`npm-production` Environment审批；向用户报告同一run审批入口并等待用户完成，不请求第二次发布审批。
6. 审批后继续跟踪同一run。Protected job必须依次执行credential-free OIDC probe、final`pre-tag` convergence、tag `preflight|ensure`、Registry snapshot、`npm publish <tarball>`、双dist-tag/integrity readback、GitHub Release ensure和官方Registry精确安装smoke；任一tag/source/workflow/candidate/integrity漂移都fail closed。
7. workflow必须只执行一次 `npm pack`并保留release artifact manifest；发布前smoke、CI artifact evidence和`npm publish <tarball>`必须绑定同一filename、SHA-256与SHA-512 integrity。恢复attempt可复用同run冻结artifact与匹配公开事实，但新的protected deployment/attempt仍可能按GitHub规则再次要求审批；不得通过弱化Environment protection规避。
8. registry 已存在目标版本时，只有 `dist.integrity` 与本次 manifest 一致才允许跳过 publish；不一致立即停止。publish 后等待有界 registry readback，确认目标 version、integrity 和 dist-tag 全部一致。
9. GitHub Release 使用 ensure 语义：不存在时创建，存在时核对 tag target、正文和 prerelease/Latest；RC 必须是 prerelease 且不是 Latest，稳定版必须不是 prerelease 且成为 Latest。不一致时停止且不得覆盖。该步骤成功后仍需继续跟踪发布后 smoke，不能把 Release 已创建单独视为完成。
10. 使用同一 release notes 提取器生成期望 Markdown，并核对 `gh release view <tag> --json body` 返回的 GitHub Release body 与目标版本内容一致；不得只因 Release 已存在就接受笼统 PR 摘要。
11. 从 npm 官方 registry 安装精确 `@buildr-ai/buildr@<version>` 并运行发布后 CLI 生命周期 smoke；不得使用 checkout、本地 tarball 或浮动 dist-tag 冒充发布后验证。
12. 上述发布事实全部验证成功后，使用同一权威 Node执行 `release-transaction-evidence.mjs inspect-run --run-id <publish-run-id> --repository BuildrAI/Buildr`，下载既有`release-evidence-*` artifact到系统临时目录，验证context/evidence digest与GitHub run/source/attempt一致，返回release Task、retrospective、support Tasks、Candidate、main/dev、publish、tag、npm/GitHub Release和Registry smoke的portable关联结果，并立即清理临时目录。inspect失败不得把发布描述为完整，也不得重发workflow。
13. Task Finish 已按正式生命周期清理Environment时保持该结果；publication只依赖上述Receipt重建，不重新创建旧worktree。若同一次发布授权前Environment仍为ready，则在发布事实和inspect全部成功后通过Task Environment正式cleanup，不把它留作长期恢复点。禁止用手工worktree或手工依赖安装补造环境。
14. 远端 release task 分支只服务于发布准备与中断恢复；本地清理完成后，该远端分支不再承载有用工作，必须进入发布后清理检查，不得把长期保留当作默认结果。查询远端 `tasks/release-<version>`；如 ref 存在，展示待删除 ref、commit，以及已验证的 tag、npm version/dist-tag、GitHub Release 和安装 smoke 证据，并请求用户明确授权删除；只有取得该授权后才删除远端分支，随后重新查询远端确认 ref 不存在。用户未授权、查询不可用或删除失败时保留分支并报告清理 follow-up，不得因此重做 tag、npm publish 或 GitHub Release。

发布候选版不得主动把 `latest` 当作稳定版更新。发布稳定版后确认 `latest` 指向稳定版本，并报告 `next` 的当前状态，不擅自移动或删除它。

## 中断与失败恢复

- 正式transaction尚未dispatch：修复候选后重新验证；不要沿用内容已变化的验证结果。
- release Task Finish 已完成但self-bootstrap activation未完成：保持history bridge、PR与tag均未执行，从matching Finish run的唯一runner诊断或按其精确recovery plan恢复；不得先bridge、手工拆分activation阶段或让runner接受descendant merge。
- squash merge 已成功但 `main -> dev` 历史衔接未完成：保留已合入 `main`、activation后candidate tree与matching self-bootstrap evidence，从evidence和tree-identity门禁重新检查。evidence/ref mismatch、tree mismatch、远端竞争或push拒绝时不创建tag，不回滚`main`，不force push`dev`；若原evidence已删除或无法证明，不得补造，停止并人工核对本次发布现场。
- 已发布版本高于 `dev` package version：停止新版本准备，先创建独立 recovery change，把 package/lockfile 和缺失发布事实语义合并回当前 dev；不得直接使用 `ours` merge 声称发布内容已收敛。
- protected transaction已创建tag但后续失败：保留tag，检查同一workflow run、Environment和expected`publishAuthority`，不删除tag后重发。npm返回`E401`、`ENEEDAUTH`或OIDC/Trusted Publisher相关`E404`时，按expected tuple修复current GitHub/npm控制面，再rerun完整release transaction；新attempt必须重新执行同job hosted probe与pre-tag gate，不dispatch独立probe，也不得回退本机token publish。
- `dev → main` Candidate shard失败：读取aggregate finding、失败shard evidence和内部阶段timing。同一SHA的暂态失败使用GitHub“重新运行失败作业”，让新attempt evidence覆盖该shard旧artifact并重跑aggregate；不得重跑全部workflow。代码修复产生新SHA时旧evidence必须失效，但三个Windows高成本shard继续并行，不能恢复为单个串行Windows完整Candidate。
- npm 版本已经存在：不得再次 publish；先比较官方 registry `dist.integrity` 与本次 release artifact manifest，一致才恢复尚未完成的 dist-tag readback、GitHub Release 或发布后 smoke，不一致时 fail closed。
- GitHub Release 已存在：不得重复创建或自动覆盖；核对 tag target、CHANGELOG 正文和 prerelease/Latest 状态，一致才复用。
- npm version 已存在但 GitHub Release 缺失：从目标版本 changelog 重新生成 notes，恢复 Release 创建时继续使用已有 tag，不回退到 `--generate-notes`。
- npm publish、GitHub Release 或 dist-tag 已成功但后续 smoke/网络步骤失败：保留这些不可逆事实；同一 tag 重跑从 manifest integrity 和远端 readback 恢复，不删除 tag、不 unpublish、不重复 publish。
- push、PR merge、workflow、npm 或 GitHub 状态不一致：停止后续不可逆动作，报告已完成步骤、当前事实和最小恢复路径。
- 发布后发现问题：候选版发布新 RC；稳定版发布 patch，必要时 deprecate 或移动 dist-tag，不默认 unpublish。

## 完成报告

报告以下事实：

- 发布类型、version、Git tag、npm dist-tag 和 commit。
- 准备阶段是否停在 tag 前，或发布阶段的 workflow run 与 Environment 审批状态。
- changed/affected结果；适用时的本地完整Candidate结果；以及GitHub `Candidate gate`绑定的source SHA、aggregate、各shard wall-clock/runner minutes、最长Windows shard和重跑范围。
- matching release Finish run、self-bootstrap result的`passed|not-applicable`、activation后`origin/dev` commit/tree、bridge evidence校验与临时evidence清理状态。
- 本次发布范围是否涉及 Buildr CLI；若涉及，retained `projects/product/buildr`的checkout、Node、channel、source commit、package/version、help和doctor结果，以及npm发布物的独立验证状态。
- npm 官方 registry、GitHub Release 和安装 smoke 结果。
- release transaction context/evidence identity，以及release/support Task、retrospective source、Candidate/publish run、main/dev、tag和公开发布事实的inspect关联结果。
- GitHub Release body 是否与目标版本 changelog 预览一致。
- 未完成步骤、阻塞项、回滚或后续版本建议。
- 本地 release worktree/branch 的清理前置条件、删除结果与复核结果。
- 远端 release task 分支是否存在、是否已获授权清理，以及删除后的远端 ref 复核结果。

不要把“PR 已创建”“tag 已推送”“workflow 已启动”单独视为发布完成。
也不要把已无恢复价值的本地 release task environment 或远端 release task 分支遗留为默认完成状态；远端分支未取得删除授权时必须明确报告待清理项。
