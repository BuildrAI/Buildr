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
7. 使用 `node projects/product/services/buildr/scripts/release/release-notes.mjs <version> CHANGELOG.md` 生成目标版本的最终 GitHub Release notes 预览；目标章节缺失、重复或没有具体内容时视为发布阻塞。

版本不明确时，根据现有版本提出下一合法版本并让用户确认。RC 问题使用新的 prerelease 序号；稳定版本问题使用新的 patch，不把 unpublish 当作常规回滚。

## 检查发布条件

只读检查至少覆盖：

- 目标版本与 tag、npm tag 的映射一致。
- 目标提交可从 `dev` 收敛到 `main`，没有未处理改动或未完成发布范围。
- CHANGELOG、README 当前版本入口、known limitations 和 release checklist 与目标类型一致。
- `CHANGELOG.md` 存在唯一的 `## <version> - <YYYY-MM-DD>` 章节，release notes 提取器输出与目标版本一致且不包含相邻版本内容。
- CI、`npm-production` Environment 和 publish workflow 仍存在；tag publish jobs 与手动authority probe job事件互斥，并使用相同repository、workflow、Environment和`id-token: write`身份。Current authority只能由GitHub-hosted probe对目标package完成npm OIDC token exchange证明；本机npm CLI、登录态、OTP与`npm trust list`不再是前置条件。检查意图只核对该能力结构，不触发hosted run；准备或发布阶段才按明确授权运行probe。
- tag workflow 只生成一次带 manifest/integrity 的 release tarball，发布前 smoke 与 `npm publish <tarball>` 消费同一文件，并且不重复运行完整 Candidate。
- 候选版没有误用 `latest`；稳定版没有误用 `next`。
- 稳定版的 RC 反馈、发布阻塞 Issue 和已知限制已经明确评估。

输出 `ready`、`blocked` 或 `already-published`，并列出证据和下一步。检查意图不得顺带修复。

## 准备发布

准备阶段是普通开发任务，遵循 `task-triage`、`task-worktree`、项目验证和 `task-finish`：

1. fetch `origin/dev`，将其 commit 记录为本次不可变 `<candidate-base>`；从不带 `v` 前缀的完整目标 package version 派生发布 task identity：task id 为 `release-<version>`，分支为 `tasks/release-<version>`，canonical worktree 为 `<workspace-root>/.worktrees/release-<version>`，且新 worktree 必须从该 `<candidate-base>` 创建。同一版本已有分支和 worktree时必须检查归属、base 和当前远端状态后复用，不创建第二个发布任务 identity；不得在 `main` 直接准备发布材料。
2. 新建发布 worktree 后，立即在该 worktree 的 `projects/product` 执行 `npm ci`；该步骤必须先于版本文件、发布材料和候选验证修改。复用已有 worktree 时，依赖缺失或 lockfile 已变则重新执行 `npm ci`。`npm ci` 失败时停止发布准备，不继续修改、验证或 Git 集成。
3. 使用无 tag 的版本更新方式同步 `package.json` 和 `package-lock.json`。
4. 更新 CHANGELOG、README 当前发布入口、known limitations 和 release checklist；只记录真实发布范围和仍存在的限制。
5. 从 workspace root 运行 `node projects/product/services/buildr/scripts/release/release-notes.mjs <version> CHANGELOG.md`，向维护者展示 workflow 将使用的最终 notes；提取失败或内容仍是笼统发布标题时继续维护 CHANGELOG，不进入候选验证。
6. 确认 lockfile 不因本机 install 镜像写入私有或非 canonical registry URL，`publishConfig.registry` 保持 npm 官方 registry。
7. 运行受影响验证，再对冻结候选运行一次完整产品验证；读取 timing summary 并报告总耗时、最慢阶段、失败阶段和路径。记录已验证 candidate tree identity（`git rev-parse HEAD^{tree}`），后续相同 tree 的 commit、squash 结果和历史衔接复用该证据。
8. 使用 `task-finish` 把准备改动 fast-forward 集成并推送到 `dev`。release task 如果无法从 `<candidate-base>` 无语义冲突地进入当前 `dev`，必须停止；需要排除已有 dev 内容时，先结束本次准备并在 dev 上通过独立 change/revert 移除，禁止改从旧 dev ancestor 制作候选。
9. 检查本次发布范围是否涉及 Buildr CLI 入口或实现，包括 `buildr`、`bin/buildr.mjs`、`src/**/*.mjs`、legacy安装/卸载脚本或 npm CLI 映射。若涉及，必须从已经集成本次改动且会继续保留的 Product checkout，以该Task Environment绑定的Node显式运行 `projects/product/buildr version --json`、`projects/product/buildr --help` 和 `projects/product/buildr doctor --agent <agent> --target <workspace-root> --json`，核对development channel、source commit、Node和package/version。不得调用`scripts/install-buildr-cli`，不得读取、创建、覆盖或要求PATH默认`buildr`绑定checkout。npm发布身份由候选tarball验证与发布后官方registry精确安装smoke独立证明；两类证据不得互相替代。任一验证失败时停止发布准备，也不得要求维护者去其他workspace通过Agent“更新Buildr”代替本地checkout验证。
10. 从保留 workspace 运行 `node projects/product/services/buildr/scripts/release/release-convergence.mjs --repo <workspace-root> --version <version> --candidate-base <candidate-base> --candidate-tree <tree> --stage pre-main`；只有 `ok: true` 才创建 `dev -> main` PR。checker 必须证明版本提交已进入 `origin/dev`、dev tree 等于候选，并且没有未集成的同版本 release task ref。
11. 创建 `dev -> main` PR，等待必须的 CI 和 branch protection，通过后按仓库策略 squash merge 到 `main`。
12. PR 合入后使用 `node projects/product/services/buildr/scripts/release/bridge-main-to-dev.mjs --repo <workspace-root> --version <version> --candidate-tree <tree>` 执行发布专用历史衔接。该工具必须先确认 `origin/main^{tree}` 和 `origin/dev^{tree}` 都与已验证 candidate tree，且两个 ref 的 package version 都与目标版本一致；`origin/main` 已是 `origin/dev` 祖先时 no-op，否则创建仅衔接历史、不改变 tree 的 merge commit，复核 tree 后普通 push `dev`。
13. bridge 后，以 `origin/main` 完整 commit 运行一个入口：`node projects/product/services/buildr/scripts/release/release-authority-probe-runner.mjs --repo <workspace-root> --source-commit <origin-main-commit> --output <authority-evidence.json>`。Runner生成唯一probe id，dispatch同一`publish.yml`的手动probe、显示run URL、等待唯一run、下载credential-free artifact，并由`release-authority-preflight.mjs`通过GitHub current API复核run、artifact、package、source commit、workflow digest和唯一`publishAuthority`。若`npm-production`要求人工审批，maintainer只在GitHub批准该run，不执行本机密码或OTP输入。Hosted job只执行OIDC token exchange，不创建tag、不pack/publish、不创建Release；GitHub ID token与npm exchange token都不得进入stdout、output或artifact。`ready` v2 evidence必须在15分钟内交给post-main convergence；任何drift、过期、exchange拒绝、run/artifact不可用或远端竞争都停止，不要求本机npm login/OTP，也不得用人工UI/checklist替代。
14. 使用同一 evidence 运行 convergence checker 的 `--stage post-main --authority-evidence <authority-evidence.json>`；任一 base、version、tree、ancestry、release task、authority evidence、远端竞争、branch protection 或 push finding 都必须停止后续 tag 动作。该 version/tree gate 失败时不得使用 force push、reset 或 `ours` 掩盖内容差异。
15. 确认 `main` 指向已验证内容，版本和发布材料一致，且远端 `dev` 已包含 squash `main` 历史。
16. 明确报告“准备完成，尚未创建 tag，尚未触发 npm 发布”，并在涉及CLI时同时报告retained `projects/product/buildr`的identity与验证结果；不得把它描述为机器默认或npm发布入口，然后停止。

准备候选版时使用 prerelease 版本并声明 `next`；准备稳定版时移除 prerelease 后缀，确认稳定发布日期和 `latest`，并额外复核 RC 反馈是否收敛。

## 发布版本

只有用户明确要求发布对应候选版或稳定版时执行：

1. fetch 远端并确认本地 `main`、`origin/main` 和已准备的候选提交一致；工作区必须干净。
2. 再次执行只读发布检查。首次发布确认目标 npm version、Git tag 和 GitHub Release 不存在；继续中断发布则记录已有 tag、npm version/integrity、dist-tag 和 GitHub Release 的精确状态。紧邻 tag 创建前重新运行GitHub-hosted authority probe生成v2 evidence，并用 `release-convergence.mjs --stage post-main --authority-evidence <authority-evidence.json>` 复核；不得沿用exchange/run readback失败、超过15分钟或source/workflow已漂移的旧evidence。
3. 确认 `package.json` version 与将创建的 `v<version>` 完全一致。
4. 在已验证的 `main` 提交创建 annotated 或仓库约定的 release tag，并普通 push 该 tag；不得 force push 或移动已有 tag。
5. tag push 后只使用 GitHub-hosted publish workflow。不得因为 workflow 等待、失败或 npm 认证问题改为本机 `npm publish`。
6. workflow 等待 `npm-production` Environment 审批时，向用户报告审批入口并暂停；审批必须由用户完成。
7. 审批后继续跟踪同一 workflow。它必须只执行一次 `npm pack` 并保留 release artifact manifest；发布前 smoke、CI artifact evidence 和 `npm publish <tarball>` 必须绑定同一 filename、SHA-256 与 SHA-512 integrity，不得在 tag 阶段重跑完整 Candidate 或从 checkout 隐式重新打包。
8. registry 已存在目标版本时，只有 `dist.integrity` 与本次 manifest 一致才允许跳过 publish；不一致立即停止。publish 后等待有界 registry readback，确认目标 version、integrity 和 dist-tag 全部一致。
9. GitHub Release 使用 ensure 语义：不存在时创建，存在时核对 tag target、正文和 prerelease/Latest；RC 必须是 prerelease 且不是 Latest，稳定版必须不是 prerelease 且成为 Latest。不一致时停止且不得覆盖。该步骤成功后仍需继续跟踪发布后 smoke，不能把 Release 已创建单独视为完成。
10. 使用同一 release notes 提取器生成期望 Markdown，并核对 `gh release view <tag> --json body` 返回的 GitHub Release body 与目标版本内容一致；不得只因 Release 已存在就接受笼统 PR 摘要。
11. 从 npm 官方 registry 安装精确 `@buildr-ai/buildr@<version>` 并运行发布后 CLI 生命周期 smoke；不得使用 checkout、本地 tarball 或浮动 dist-tag 冒充发布后验证。
12. 上述发布事实全部验证成功后，默认直接清理本地 release task environment，不把它留作长期恢复点。从保留的 checkout 执行：确认 `<workspace-root>/.worktrees/release-<version>` 干净、`tasks/release-<version>` 已集成到目标开发分支、没有该 environment 所属的健康 preview，且本机 `buildr` 不指向该 worktree；随后删除该本地 worktree 和本地分支，并复核 worktree 列表与本地 ref 均已不存在。此清理不依赖远端 release task ref 是否存在；任一检查或删除失败时保留现场，报告具体阻塞和恢复路径。
13. 远端 release task 分支只服务于发布准备与中断恢复；本地清理完成后，该远端分支不再承载有用工作，必须进入发布后清理检查，不得把长期保留当作默认结果。查询远端 `tasks/release-<version>`；如 ref 存在，展示待删除 ref、commit，以及已验证的 tag、npm version/dist-tag、GitHub Release 和安装 smoke 证据，并请求用户明确授权删除；只有取得该授权后才删除远端分支，随后重新查询远端确认 ref 不存在。用户未授权、查询不可用或删除失败时保留分支并报告清理 follow-up，不得因此重做 tag、npm publish 或 GitHub Release。

发布候选版不得主动把 `latest` 当作稳定版更新。发布稳定版后确认 `latest` 指向稳定版本，并报告 `next` 的当前状态，不擅自移动或删除它。

## 中断与失败恢复

- tag 尚未 push：修复候选后重新验证；不要沿用内容已变化的验证结果。
- squash merge 已成功但 `main -> dev` 历史衔接未完成：保留已合入 `main` 和已验证 candidate tree 证据，从 tree-identity 门禁重新检查。tree mismatch、远端竞争或 push 拒绝时不创建 tag，不回滚 `main`，不 force push `dev`。
- 已发布版本高于 `dev` package version：停止新版本准备，先创建独立 recovery change，把 package/lockfile 和缺失发布事实语义合并回当前 dev；不得直接使用 `ours` merge 声称发布内容已收敛。
- tag 已 push、workflow 未开始或失败：保留 tag，检查 workflow、Environment 和 expected `publishAuthority`，不删除 tag 后重发。npm 返回 `E401`、`ENEEDAUTH` 或 OIDC/Trusted Publisher 相关 `E404` 时，针对current `main`重跑GitHub-hosted authority probe，按expected tuple修复current GitHub/npm控制面，再rerun同一GitHub-hosted publish workflow；不得回退本机 token publish。
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
- 完整验证结果和 timing summary。
- 本次发布范围是否涉及 Buildr CLI；若涉及，retained `projects/product/buildr`的checkout、Node、channel、source commit、package/version、help和doctor结果，以及npm发布物的独立验证状态。
- npm 官方 registry、GitHub Release 和安装 smoke 结果。
- GitHub Release body 是否与目标版本 changelog 预览一致。
- 未完成步骤、阻塞项、回滚或后续版本建议。
- 本地 release worktree/branch 的清理前置条件、删除结果与复核结果。
- 远端 release task 分支是否存在、是否已获授权清理，以及删除后的远端 ref 复核结果。

不要把“PR 已创建”“tag 已推送”“workflow 已启动”单独视为发布完成。
也不要把已无恢复价值的本地 release task environment 或远端 release task 分支遗留为默认完成状态；远端分支未取得删除授权时必须明确报告待清理项。
