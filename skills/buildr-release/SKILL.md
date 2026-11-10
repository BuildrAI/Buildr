---
name: buildr-release
description: 准备、检查、发布或恢复 Buildr 主包、DSH 插件或联合版本时使用；按统一发布流程核对独立版本、共享源码选择、真实包兼容、逐包授权与恢复事实。
---

# Buildr 发布

日常修改涉及初始化、安装、源码包或验证工具时，使用现有受影响入口覆盖相关链路，不等发布才检查。候选运行期间不改源码；同轮先跑完独立检查、汇总失败，取得用户同意后修复；接续只重跑失败项并首次执行未执行项。定位源码检查失败直接使用现有 `test:related -- --check <check-id>`，正常日志保留用例名称和耗时，同轮已通过的真实结果直接采用，不再手写旁路诊断后重复跑一次。原包失败继续使用准确原包的原验包入口，不重新制包。

本技能（Skill）拥有 Buildr 自举工作空间的发布流程与随附发布代码，不作为 npm 内置技能分发。先读唯一流程正文 `projects/product/knowledge/docs/flows/open-source-release.md`：固定候选、跑测试、打包、验包、发布。人决定目标和公开授权；智能体（Agent）按当前事实推进。

## 执行入口

### 本机正式消费预演与冻结规则

新准备在分发前调用 `scripts/local-consumption-preflight.ts`：主包用既有 `candidate-ci.ts plan/aggregate` 只采用真实本机证明，再调用正式发布器的原包读取与覆盖函数；插件共用正式消费者的准确原包和完整证明读取。首次成功预演的主包汇总随 handoff 和原始证明冻结；相同原包、证明与规则接续时直接采用，输入变化则拒绝。GitHub 保全模式核对来源、规则、字节与覆盖后采用该汇总，不重复推导；旧交接、独立验证源及显式对端检查仍走原路径。实际重新执行预演时使用独立派生证据目录，不能让上次成功掩盖本次失败；回执只证明本机消费，不虚构 Actions 身份或公开资格。`local-consumption-preflight-required` 时保留原包，修复读取／契约后继续，不重建 SDK、制包或启动测试轮。

新交接的 `verificationRules` 固定输入分类策略、验证配方、消费契约、平台策略和声明范围；已有 `verification-rules.json` 不被新默认覆盖。新来源绑定为 `buildr.candidate-source-binding/v2`，携带 `buildr.build-input-policy/v1`；历史 v1 绑定仍可读取。分类规则必须按版本保留，不能修改旧版本解释。漂移时明确诊断，不自动重派碰运气。

### 未公开候选撤回

统一入口 `withdraw --workspace <canonical> <原选择版本参数>` 默认只读，返回准确 `plan.identity`、临时引用和附件 ID；只有用户明确授权该撤回后，才添加 `--authorized --plan-identity <准确摘要>`。保全位置为规范工作空间 `.buildr/local/release-withdrawals/`，保留原包／证明、源码 Git bundle、运行日志和附件 ZIP；全部校验后才按租约删除三个已归属临时远端引用及当前运行附件，历史运行不删除。本机工作树、选择引用和其他运行附件不在此工具清理范围内。

仅适用本机原包模型、运行已结束且没有公开／主线采用意图的候选。公开请求、活动 PR／运行、身份漂移、过期附件或未知请求停止相关清理；不自动取消运行、回滚主线或删除正式 tag/Release/npm。清理意图先保存，未知结果只回读，不自动重发；原 `withdraw` 携同一准确身份接续。已进入撤回的选择不能再 `prepare/resume/publish`；新候选使用新选择，不手改操作 JSON 恢复。此入口不是历史发布批量清理，也不授权实际撤回。

### 新主包候选：本机验收、远端保全、可选冒烟

新 `prepare` 默认使用 `buildr.local-package/v1`：在干净冻结检出目录采用本机源码证明，自动生产唯一原包并完成通用及本机系统验收，随后从已登记的 `verify.yml` 入口调用 `verify-package.yml`，以 `preserve_only=true` 仅校验并保全原包和本机证明。新 handoff 固定 `buildr.local-required-remote-optional/v1`，另一系统不再是候选门槛，汇总明确 `not-verified`。本机最低 Node 为实际 `24.15.0`；远端不制包、不安装产品、不补源码或重型原包检查；中立系统保全不能当作平台验证。独立插件与联合候选均在本机自动运行 `tools/ensure-release-sdk.ts` 准备准确 SDK，再用既有 `verify-all.ts` 完整验证和保留唯一插件原包。有效 SDK 按输入、工具、平台、依赖与产物校验复用；不能用缓存命中替代插件验证。独立插件的远端作业只校验及保全原包和证明，不编译 SDK、不重建插件、不执行无关主包对端验收。若完整源码差异确实要求主包 QA，仍保留该范围，但插件继续消费冻结的已公开主包对端。

原包、范围和真实本机证明通过不可变临时数据引用交接；远端从冻结产品源码执行，只把交接引用当数据。不要创建临时 Release、改 npm 认证、将本机证明伪装为远端执行，或手动覆盖操作 JSON。正常准备继续使用下述统一入口，不要求用户搬运原包。

本机源码、SDK 或原包缺项由智能体按返回动作补齐，接续同一 `prepare`；等待时只读取同一运行和校验保留字节，不重复本机验收。保全失败只恢复校验／上传，保留原包与本机证明。对端轻量冒烟独立触发，不影响新策略候选；旧候选仍按原模型恢复，不能静默降级。公开发布仍独立授权，消费同一原包，不重新制包或跑测试。

独立对端冒烟从同一 `verify.yml` 入口使用 `purpose=local-package` 和冻结 `local_package` 数据，设置 `diagnostic_only=true`、`preserve_only=false`，不复用正常候选聚合；`remote_runner` 选择本机的另一系统。`diagnostic_source_commit` 仅在原包源码与工作流修复提交不同时指定准确原包源码。工作流使用独立验证器检出目录及隔离 runner 调用 `test/verification/release/package-smoke.ts`：实际 Node `24.15.0` 下一次离线安装、CLI帮助和身份、一次Web健康检查与进程清理。没有SDK、源码轮、init/sync/Doctor/卸载、第二次最低Node安装。结果 `buildr.package-smoke/v1` 只作诊断，失败和未执行都不等于通过；不生成完整 Candidate。

下文涉及远端生产原包、下载交接与正式补验的说明只适用于已有旧模型记录；新主包候选不得按旧模型另开一次候选。旧事实、授权和未确认请求保持原样，不自动迁移。

发布代码的唯一源是所选源码检出位置的 `skills/buildr-release/scripts/`。从该位置的 `projects/product/services/buildr/` 使用 `tools/development/run-development-node ../../../../skills/buildr-release/scripts/release-orchestration-runner.ts --help` 查看当前参数，再调用 `prepare`、`inspect`、`publish --authorized` 或 `resume`。投射到智能体的技能副本用于发现和指引；不要从投射目录运行绑定源码的脚本。工作流（Workflow）也调用同一源码脚本。

正常准备和接续使用 `--wait`，由阻塞式 `gh run watch` 等待同一远端运行，默认总等待 30 分钟，可用 `--wait-timeout-ms` 调整。禁止智能体在前台使用 `for`/`while` 加 `sleep` 反复查询 GitHub 状态。可直接运行 `gh run watch <run-id> --repo BuildrAI/Buildr --exit-status --interval 30`；合并请求的检查使用 `gh pr checks <pr-url> --repo BuildrAI/Buildr --required --watch --fail-fast`。程序仅在命令结束或有界等待预算到期后回读，以处理排队超时、失败和本机原包交接；取消等待只终止本机watch进程，不取消远端运行。缺少准确runId时返回回读缺项，不以未知结果授权再次派发。默认输出摘要，原始证据可用 `--output <file>`，诊断时使用 `--detail full`。

candidate 与发布作业默认排队 600 秒仍未开始时取消：先确认该运行没有任何作业或步骤启动，再取消并回读 `completed/cancelled`；随后清除当前指针及 journal 引用，保留 runId、取消依据、清理字段和每次重派原因的审计历史，再用完整冻结派发参数创建新运行。默认最多重派两次，可用 `--queue-timeout-seconds <seconds>` 与 `--max-queue-redispatches <count>` 调整。已启动后取消、取消结果未知、缺少原始参数或次数用尽时局部停止，不自动重派、不猜测新参数、不重复未知请求。旧的已授权请求若缺少冻结派发参数，只能从原已校验发布上下文恢复；不能从当前 `dev` 或手写参数重建。

官方 npm 注册表明确确认准确版本 HTTP 404 后，允许同一 releaseId、原冻结上下文和原包重试 npm 写入，不再因原journal未知而拒绝，并记录版本、完整性与404依据。网络错误、认证错误和完整性冲突不作为版本不存在；已公开且摘要一致时只复用。resume 继续消费原冻结的受保护执行身份，不把本机CLI进程的Node身份变化误当作发布内容变化；源码、工作流、版本、包摘要和授权仍须一致。

环境审批必须调用 `scripts/environment-approval.ts` 的 `approvePendingEnvironmentDeployments()`；整数环境 id 用大写 `-F`，或用 `--input` 的 JSON 数字。禁止手写小写 `-f` 的 `gh api` 命令绕过该函数。

发布成功后，现有 `closeoutReleaseGitResources()` 自动清理对应 release 分支、临时载体及 `refs/buildr/release/<version>/` 全部冻结引用（联合选择沿用 selectionId）。先验证 Registry、GitHub Release、tag、引用归属和源码保全；失败、未知、引用漂移或活动占用时保留相关现场。清理审计追加到 Git 公共目录 `buildr/release-cleanup.jsonl`，包含版本、ref、提交和结果。

正常发布入口在每次结束时从现有阶段时间线、错误、恢复动作及发布证据生成 `build/verification/release-process/<version>/release-report.json` 与 `release-report.md`，不由智能体手工补写。时间使用 UTC，耗时逐阶段以秒表示，同选择重试保留历史；仅完整公开证据与收尾通过标为 succeeded，失败为 failed，等待或证据不足为 unknown，缺失字段保留 null。报告写入失败独立报告，不撤销已确认公开事实；inspect 不写报告。

冻结所选包、独立版本、分支（Branch）、准确提交（Commit）、源码树和准确对端，正常准备不跟随 `dev`。全部检查及结果汇总交给产品既有验证框架；先查看本轮普通日志中的成功、失败、未执行项和耗时，再只执行失败及未执行部分。不要因阶段切换重复执行仍有效的检查；一轮集中收集互不依赖的失败，经用户同意修复后只补失败及未执行项。同一发布轮内源码输入变化时，使用 `source.ts --invalidate <step-id,...>` 只重跑受影响步骤，其余通过记录继续采用；失败 Node 节点在普通 round 结果内保留完整文件成功，按真实输入只补失败、新增或失效文件；共享实现／夹具变化扩大补验范围。缺少事件、信号中断、清理失败不能成为成功；日志会报告执行、复用和完整成员数量。显式失效节点不采用其旧文件证明。新候选轮次（新版本或新选择）从头完整执行。验证范围由用户决定：使用 `--selected-checks <step-id,...>` 只验收指定检查，范围外已有同轮通过记录标记 `retainedByUserInstruction`，没有基线记录记为 `not-run`，不因此 fail closed；使用 `--excluded-boundaries E2E --scope-statement "<用户决定>"` 时，本地源码轮与远端候选都不执行该执行边界下的检查（打包步骤 `candidate-artifact` 不受影响），聚合结果以 `declaredScope` 和 `notRun` 如实记录未执行证据，发布消费接受该声明但不接受任何真实失败。未声明的缺失证据仍使候选失败；声明只减少执行范围，从不把失败或未执行伪装成通过。修复确认并提交版本材料后，直接以本次 selectionId/roundId 运行源码轮并写入候选 round 路径，使该轮成为候选证据；不要先跑一套独立全量再重复候选全量。本机能充分证明的在本机完成，GitHub 只补真实平台、干净环境或受保护执行边界。相关开发检查在改动交付前完成，避免到发布时才修过时检查。不要在检查运行时改变其源码或共享 Git 比较事实。

通用产品逻辑与功能只有一套，不按系统重复。源码入口 `test/verification/source.ts --round <selection-id> --output <round-log.json> --scope common|platform|all` 使用同一检查登记。新模型在本机完成通用及本机源码后制包；本机原包的系统专项仍必需；对端为独立可选冒烟，不自动补齐。历史模型才在远端补另一系统源码并由 GitHub 制包，不用于新准备。

README 固定标题、章节和编辑表达不作发布门槛。检查失败先判断是否保护功能、安全或交付正确性，无独立价值的措辞检查直接删除；必要的文档链接、渲染、资源引用和敏感信息检查按实际影响选择，不因文档改动追加整组快速检查，也不为技能（Skill）正文另写措辞断言。架构及规范静态检查留在相关开发检查中，不加入候选必跑集合。插件本机源码预检使用 `tools/verify-source.ts`（可用 `--round <selection-id> --output <round-log.json> --invalidate <step-id,...>` 保存普通结果），无需准备软件开发工具包（SDK）或旧主包对端；准确候选配对仍保留完整检查。

历史远端制包模型把通用原包检查与本机系统验包留给本机。制包上传且同轮原包可校验后，旧 `prepare --wait` 自动下载并立即返回 `local-artifact-verification-required`，无需等远端终态；与另一系统的远端验包并行；使用实际 Node `24.15.0` 运行 `tools/development/run-development-node test/verification/artifact.ts --artifact-dir <原包目录> --output <证据目录>`，默认一次检查通用原包、本机启动和最低 Node，不另跑当前版本。`--scope common` 只检查通用原包，`--scope platform` 只检查本机系统；macOS 和 Windows 对称选择，互不附带另一系统或已完成的通用检查。实际程序与系统随结果保留。`local-artifact-verification-required` 或远端 `incomplete` 表示仍等本机缺项，不是完整候选通过；完成后继续原 `prepare --artifact-verification <证据目录>`，仅采用原包与有效结果、补缺项和完整汇总，不重新产包。远端发布始终另需准确授权。

主包产包入口是 `scripts/candidate-package.ts`，插件发布代码在 `scripts/dsh-plugin/`；一般构建和验证工具仍归相应服务。每个包只生产一份准确原包，测试或汇总修复不默认重打；产品及真实构建输入变化才使相关原包和证明失效。正式补验绑定独立验证来源，不授予补验代码公开权限。

只准备到验包时使用 `prepare --stop-after candidate`：完整候选与原包检查通过后，把原包和证明保全到规范工作空间，通过既有任务应用登记验证报告和结果材料，并关联本轮要求的过程报告，结束准备任务；不进入 `main` 采用或公开。返回后核对逐项收尾结果，不把 `candidate-verified` 单独当作资源已清理。登记失败只恢复登记；工作树（Worktree）中的执行程序不能自删目录，退出后立即按返回动作接续清理。正常待发布候选保留仍有用途的冻结引用（Ref），不默默遗留临时资源；已有公开授权或请求的旧选择不能用于此模式。

已完成准备仍可检查或明确接续同一冻结选择，不重开任务、不重新制包或重测。需要纳入新源码、重新冻结或处理主线身份漂移时，先按明确目标恢复活动准备，再走既有写入边界；任务完成不授予公开权限。

主包和插件共用发布后回读等待：正常最多查询24次、间隔20秒，版本可见即结束；普通日志保留命令退出码、查询结果和耗时。等待窗口用尽只接续同版本回读，不因尚未可见重新上传。插件原受保护运行已尝试写入，随后准确原包已公开时，直接结合原运行记录补登记，保留其真实失败状态，不为刷新登记再开远端恢复运行，也不重新下载已公开包的候选。未知原包或原包冲突继续局部停止。

联合发布中，已确认成功的包直接采用既有结果，不在等待另一包时反复查询运行、下载发布记录或读取公开原包；新的公开写入仍核对其当前对端。声明完整时只下载当前待写入包的候选，旧包缺少兼容声明时仍保留必要的真实配对检查。使用一次正常等待和一次实际收尾返回值，不反复调用只读检查、重新保存同一报告或重新核验已清理对象。

将用户意图路由到正文对应入口：检查只读当前事实；准备停在公开发布之前；发布需有当前所选包准确版本与内容的授权；恢复保留已成立效果，仅继续未完成事项。已有授权在范围未变时继续有效，平台权限及必要审批仍须满足。

检查失败只补相关检查，汇总失败只恢复汇总，未知请求先回读；登记或清理失败保留已发生公开事实。完成时报告逐包结果、真实耗时、采用的旧结果和未验证边界，并明确本机开发应用未更新（activation 为 not-run）；本机更新另行授权 `buildr-self-bootstrap-sync`，不等待自举激活。任务登记以实际保存返回值为准，不为证明同一次保存反复打开界面；登记和清理各完成一次，失败只恢复对应动作。发布任务自己的工作树由发布收尾处理；执行者用于修复的工作任务工作树和临时资源不属于发布任务，应按 `task-finish` 核验清理或在结果中说明保留原因，不静默遗留。

每次候选准备或发布结束、中断后，依据本次已有执行记录做简短回看，在原发布任务材料中保存并引用原始日志，核心只有三点：（1）耗时分析，区分准备、等待、执行及修复补验，指出主要耗时项，缺失数据注明未知；（2）判断是删还是改，先审视相关检查或流程是否必要，再建议删除、简化或修正，保留必要的功能、安全与真实平台验证；（3）根据实际问题提出最多5项改进建议。正常执行简短记录即可；不为回看新增检查、重跑或阻塞发布，改进按后续授权实施。
