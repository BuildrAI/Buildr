---
name: buildr-self-bootstrap-sync
description: 仅在当前会话持有matching Formal Task Finish Result且Buildr自举Workspace的Finish成功或只被retained Doctor阻塞后使用；协作者推送、普通Workspace update或本地没有对应Task时不适用。多个可证明Finish carrier可隔离共存；runner只在相同remote与branch的activation窗口获取target lease，收敛latest target后按冻结Task Contribution执行self-bootstrap activation，并以最终Doctor或same-run resume收敛。
---

# Buildr Self-bootstrap Activation

本Skill只属于Buildr自举Workspace。它是`buildr-self-bootstrap` Component唯一的activation orchestrator，不是Finish provider、产品阶段或用户Workspace默认能力。它不创建receipt、数据库记录、事件或状态机，只使用当前会话中同一Formal Finish Result、产品resume事实与命令evidence。

## 输入与适用性

只消费Product CLI的稳定`buildr.task-finish-self-bootstrap-input/v1`投影，其中包含Task/run identity、Agent、canonical Workspace、remote/target branch、唯一Workspace repository、run-owned carrier container、repository carrier集合、final或remote-after ref、冻结Task Contribution paths，以及blocked路径的matching resume token。不得直接解析`buildr.task-finish-result/v2|v3|v4|...`，也不得从HEAD、dirty tree、当前diff、时间或安装结果反推贡献。

内部Task Finish Result升级但自举语义不变时，只由Product projector把新major归一化到稳定v1，runner不增加内部版本分支。同一稳定major的未知additive字段必须忽略；未知稳定major、必需identity缺失或语义不能完整投影时，在任何effect前fail closed。自举语义本身需要不兼容变化时，由Product发布新的稳定投影major并显式迁移runner。

当前会话没有绑定同一canonical Workspace、Task、run与delivered ref的matching Formal Finish Result时，本Skill必须在启动runner前返回`not-applicable`：不得从commit author、协作者提交、Git tree前进、Doctor runtime drift或本地缺少对应Task反推Finish。此时按普通Workspace update处理，先消费post-transition Doctor；若其适用修复是当前Agent workspace sync，则路由产品入口Buildr Skill按授权执行`buildr sync <agent> --target <workspace-root>`。本地没有协作者Task是正常事实，不触发Task恢复、回滚、self-bootstrap或新的生命周期authority。

Result必须恰好属于一种模式：

- `complete`：`status=complete`、五阶段完成且Environment cleanup成功；
- `doctor-blocked`：`status=blocked`、`primaryFailure.phase=deliver`、`operation=retained-doctor`、carrier/remote readback/partial delivery完整、`delivery.status=activation-blocked`、Environment尚未cleanup且`resume.phase=deliver`包含matching token。

`doctor-blocked`只有至少一个下述动作适用时才能覆盖普通停止规则。其他blocked/failed Result、并列failure、缺失partial delivery或无动作匹配一律返回`not-applicable`并保留原Finish结论。

按规范化Workspace相对路径形成封闭动作集合：

- `sync-retained-workspace`：`projects/product/services/buildr/package/manifest.yml`、`projects/product/services/buildr/package/targets/workspace/**`或`projects/product/services/buildr/package/targets/runtime/skills/buildr/**`；
- `install-development-local-app`：这是保留兼容的内部动作ID；用户可见能力是development Buildr Web。它由`projects/product/services/buildr/src/interfaces/local-app/**`、`projects/product/services/buildr/src/interfaces/cli/launcher.mjs`、`projects/product/services/buildr/package/launchers/**`、`projects/product/services/buildr/package.json`、`projects/product/services/buildr/package-lock.json`或`projects/product/services/buildr/LICENSE`命中；
- `verify-development-entry`：`projects/product/buildr`、`projects/product/services/buildr/bin/**`、`projects/product/services/buildr/src/**/*.mjs`、legacy CLI安装/卸载脚本、`package.json`、`package-lock.json`或任一其他self-bootstrap动作命中时，以Environment retained Node显式执行retained Project bridge，证明development launcher、CLI entry、Node、channel、source commit与package/version绑定本次retained checkout；
- `finalize`：identity验证通过后，`complete`模式通过该显式retained入口执行一次指定Agent Doctor，`doctor-blocked`模式通过同一入口恢复一次同一Finish run。

同一动作即使被多条路径命中也只执行一次。所有路径均未命中时返回`not-applicable`，不执行sync、Git、Buildr Web Dev install、development entry verification、Doctor或Finish resume。

多仓库Task只使用唯一`selector=workspace` repository的frozen activation paths；Service repository即使有贡献、carrier或类似Workspace路径也不能触发自举动作。Workspace repository为`not-applicable/no-contribution`时，本Skill直接返回`not-applicable`且不执行激活；这些Service与Workspace环境仍由原Task Finish cleanup统一处置。

## 执行

正常路径只启动一次本Skill携带的runner。Agent不得再逐条编排sync、commit、push、安装、Doctor或same-run resume：

```bash
<receipt-node> skills/buildr-self-bootstrap-sync/scripts/closeout.mjs \
  --run <finish-run-id> \
  --target <canonical-workspace> \
  --node-executable <receipt-node>
```

Runner是本Skill的bundled script，只存在于Buildr自举Workspace，不进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。它通过retained `projects/product/buildr task finish inspect --run ... --detail self-bootstrap --json`从同一run只读取得稳定投影，不导入Product内部Application模块；所有same-run resume也继续请求该detail。随后核对Component、投影major、模式、Workspace repository、frozen paths、target branch、remote/final ref、clean tree和retained Node identity，形成确定性plan。然后按`preflight → plan → sync → commit → push → install-local-app → verify-development-entry → finalize`执行；每阶段独立返回`passed|blocked|not-applicable`、identity、最小operations与effects，不写新authority。

在任何retained target mutation、sync、安装、Doctor或Finish resume前，命令适配层只读枚举固定根`.buildr/transient/task-finish/carriers`的直接子项。目录名只作为run候选；current与每个foreign真实目录都必须由同一retained Product `task finish inspect --detail self-bootstrap`证明稳定schema、run、canonical Workspace、精确run container、全部repository carrier的非symlink/containment/唯一性及matching resume identity。v2归一化后carrier可以等于container，v3多仓库carrier可以是其受控后代；runner不从目录层级反推内部Result major。证明闭合的foreign carrier标记为`isolated-coexisting`：runner只把它的精确run container相对目录及后代从untracked observation中排除，不忽略tracked或staged差异，也不恢复、删除或修改其中任一carrier。合法`cleanup_pending` owner仍可形成`resume-owner-cleanup`建议；Task已`abandoned`且从未成功交付时可形成`resume-owner-release-occupancy`建议。建议按`taskId + runId`稳定排序，仅供原owner后续处理，不是当前closeout的predecessor，也不生成`retry-current-closeout`。

symlink、越界、重复realpath、inspect失败、Workspace/path/carrier/resume identity或token不可证明时标记`unprovable`并在任何activation effect前阻断。证明闭合的doctor-blocked、其他blocked、terminal残留或不支持状态均可隔离共存；其owner状态只影响是否附带cleanup/occupancy建议，不影响当前run取得target lease。协调计划是ephemeral advisory read model，不写SQLite、Receipt、Execution Record、Git或第二份队列/聚合store，也不授予跨owner mutation authority。

完成Git root、target branch与clean tree证明后，runner必须先通过retained Product内部driver，以`Task/run + remote:targetBranch`获取Task Finish target lease，随后才可fast-forward、sync、commit/push、安装/重启、验证入口、Doctor或same-run resume。`complete` terminal row和matching retained Doctor blocked row都可以临时持有该lease；runner在每个潜在副作用阶段前刷新，在所有可控返回路径按token fencing释放。另一个owner占用相同target时返回`self-bootstrap-closeout.target-lease-held`且activation effects为空；不同target不因该lease互相阻塞。Product resume可能自行清除lease，runner必须在继续activation前重新获取。普通用户Workspace没有本Skill和这段self-bootstrap activation；其Task Finish只使用Product既有短deliver lease，不等待安装、重启或自举Doctor。

每次适用invocation都在lease内读取latest remote target；本地落后且latest remote线性包含Finish frozen ref时，只执行fetch与`merge --ff-only`，再从最新HEAD重做frozen ref祖先关系、无merge历史、clean tree、精确remote/branch、run/plan与全部既有preflight。`--retry-after-foreign-clear true`仅作为旧调用兼容参数接受，不再开启特殊模式，新结果和owner建议不得生成它。分叉、frozen ref不是祖先、merge、dirty tree、remote再次变化或其他target identity无法证明时停止并报告；不得merge commit、rebase、stash、reset或force push。

`install-local-app`先通过runner自带的continuity helper读取默认instance state并使用instance secret执行health认证；只有健康且`launcherIdentity.channel=development`的实例才冻结原PID与loopback端口。随后它只用Environment retained Node直接执行retained checkout中的`package/launchers/manage.mjs install --channel development`，并核对closed status、checkout source root、HEAD与development runtime executable后才继续。安装前存在上述健康实例时，helper必须显式以retained `projects/product/buildr web --port <same> --no-open`、Environment retained Node和新Launcher identity恢复服务，等待health并证明端口不变、新PID、source root、successor HEAD与Node匹配；未运行、stale或其他channel保持按需启动。恢复失败时helper只回收本次启动且PID可证明的异常进程，runner停止后续development entry gate与finalize，不回退已经成功更新且绑定delivered checkout的Launcher。它不得调用npm-owned公开`buildr web launcher`命令；公开命令没有development channel。显式`npm run install:development`复用同一内部manager，因此人工development安装与post-Finish activation共享一个安装入口，但条件式HTTP恢复只属于持有完整Finish/retained identity的self-bootstrap runner。

Plan的`baseRef`始终来自当前Finish Result的final ref。Preflight另选择本次实际`activationBaseRef`：HEAD等于base时直接使用base；HEAD已前进时，只接受base是HEAD的祖先、base到HEAD无merge、working tree clean且HEAD与Finish绑定的精确remote/branch一致的published linear descendant。普通descendant commit的作者、工具和`Buildr-Task` trailer不是activation前置条件；runner只报告frozen ref、actual activation base与descendant commits，不据此声明后继拥有Task、Verification、Review或Candidate身份。若HEAD本身带有与当前run/plan精确匹配的`Buildr-Finish-Run`/`Buildr-Closeout-Plan` trailer，则仍以其parent作为activation base，remote只可等于parent或HEAD。当前sync产生的新successor必须直接以activation base为parent。这样较早Result可以在已push的人工作者、IDE、其他Agent、后续Formal Finish或self-bootstrap successor上顺序激活，但merge、未push普通descendant、分叉或remote drift仍在安装与finalize前fail closed；不补Task、不伪造trailer，也不增加持久queue、store或第二份lifecycle authority。

如果`doctor-blocked` Result在latest target收敛后已经落后，runner必须在sync、安装、重启和Doctor之前先用current exact token恢复同一Finish run。第一次返回matching `task-finish.target-race`时，只再用新token恢复一次；每次Product调用后重新获取target lease。返回新的`complete`或retained Doctor blocked Result时，从该Result重建plan和`baseRef`后继续。返回matching Delivery Adaptation时，报告同一run的carrier、resume、完整冻结commit message与可移植preparation hints；除必要的latest-target fast-forward外，不得产生sync、安装、重启、入口验证或Doctor effects。第二次仍race、其他blocked/failed或identity不匹配时停止，不得第三次resume或重跑runner。

`verify-development-entry`不解析或执行PATH默认`buildr`。Runner直接执行本次retained checkout的`projects/product/buildr`，注入`BUILDR_NODE=<Environment retained Node>`，先使用closed development identity probe核对`scripts/run-development-cli`、`bin/buildr.mjs`与Node，再执行`version --json`核对development channel、source commit与retained `package.json`中的package/version。Project bridge缺失或不可执行、launcher/CLI entry/Node漂移、channel/source commit/package/version不一致或命令启动失败一律fail closed，不进入`finalize`。

`doctor-blocked`模式下，尚未cleanup的当前run container及repository carriers是Finish owner的恢复资源，不属于用户dirty tree。Runner只在`workspaceRoot + runId`推导的container与稳定投影精确匹配、真实存在且不是symlink，并且全部projected carrier真实、唯一、受container包含且resume identity匹配时，从untracked observation中排除该container及其后代；上述已证明的foreign container也按同一方式逐个隔离。任何carrier路径下的tracked/staged差异、其他untracked路径、root缺失、越界、重复realpath或identity不匹配仍然fail closed。此规则不写`.gitignore`或`.git/info/exclude`。

`complete`模式的`finalize`只通过已验证的retained `projects/product/buildr`运行一次指定Agent Doctor。`doctor-blocked`模式不另行运行第二个Doctor，而是由runner通过同一显式入口，使用当前Task、run id和matching resume token恢复同一Formal Finish；恢复结果必须`status=complete`且cleanup完成。若该finalize第一次精确返回target-race，runner可在重新获取lease后再交回一次matching token；若进入Delivery Adaptation，Agent可以在该runner已验证的carrier内按Task Finish owner处理，处理不了再请求用户授权。其他再次blocked只消费runner返回的current resume事实，不重复启动本Skill或递归activation。

Runner结果是正常路径的唯一执行证据。需要诊断时只读其失败阶段、实际Git/ref/remote、产品Result与可选`recoveryPlan`；不得绕过runner独立补做阶段。multi-run plan中的owner cleanup/occupancy步骤是advisory且属于原owner，协调器不得直接删除foreign carrier。只有runner返回专用target-race adaptation diagnostic后，Agent才按其中run、carrier、failure、完整冻结message、preparation hints与matching token交给Task Finish owner继续；这不是第二个activation orchestrator，也不授权修改其他carrier或改变策略。

## 失败与恢复

- staged/未知delta、symlink逃逸、frozen ref不是HEAD祖先、HEAD/remote漂移、未push普通descendant、descendant merge、current successor run/plan trailer不匹配、development entry identity不匹配、package/version不一致、launcher channel/commit不匹配，或安装前健康Development Web未能在同一端口以新identity恢复时fail closed。
- 修复本runner阻塞的正式Task时，修复Task的候选验证必须覆盖显式retained Project bridge、精确Node identity、Development Launcher、sync、Doctor与doctor-blocked same-run resume链；不得把每个后续症状自动拆成新的递归修复Task。
- 不使用`git add -A`、force push或共享历史改写，不把sync delta混入原Task carrier。
- 失败时停止后续不安全动作，报告已完成动作、失败动作、冻结inputs、当前retained/remote/CLI/launcher identity与精确恢复入口。
- `complete`模式失败固定报告“主任务已交付、自举Workspace激活未完成”，不得重新运行Finish或改写已完成Result。
- `doctor-blocked`模式失败固定报告“Formal Finish仍被Doctor阻塞、自举恢复未完成”，保留Product返回的current run/resume事实；每次activation最多使用current token一次，并只对精确target-race再承接一次；不重跑Formal Verification、生成Candidate、执行Completion Review或改写Development handoff、decision、Task Record。
- activation evidence只存在于当前Agent执行报告；不得写入SQLite、Task Record、Development/Review/Verification、Finish JSON或新聚合store。

## 结果边界

成功消费`buildr.self-bootstrap-closeout-result/v1`并报告`passed`，包含输入模式、Formal Result/run identity、frozen paths、分类与plan identity，以及每个阶段的`passed|not-applicable`、target lease operations、frozen ref与actual activation base、published linear descendant commits、sync commit/push/readback、retained Project bridge、launcher/CLI entry/Node、channel/source commit、package/version、安装前Development Web状态、适用时的原端口/前后PID/恢复identity和最终Doctor或same-run resume evidence。发现proven foreign carrier时additive返回`advisory`的ephemeral `buildr.self-bootstrap-recovery-plan/v1`并继续；只有unprovable carrier才报告`blocked`。没有foreign carrier时`recoveryPlan=null`且现有结果和执行语义不变。该结果不是新的持久authority；`complete`模式不改变Task终态，`doctor-blocked`模式只有Product resume可以形成Formal Finish终态。Task Manager继续独立管理顶层完成状态。
