---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace的Formal Task Finish成功或只被retained Doctor阻塞后使用；多个Finish carrier并存时先生成只读owner-ordered恢复计划，否则按冻结Task Contribution执行self-bootstrap activation并以最终Doctor或same-run resume收敛。
---

# Buildr Self-bootstrap Activation

本Skill只属于Buildr自举Workspace。它是`buildr-self-bootstrap` Component唯一的activation orchestrator，不是Finish provider、产品阶段或用户Workspace默认能力。它不创建receipt、数据库记录、事件或状态机，只使用当前会话中同一Formal Finish Result、产品resume事实与命令evidence。

## 输入与适用性

只消费当前`buildr.task-finish-result/v2`中的Task ID、run identity、Agent、canonical Workspace、remote/target branch、carrier/final或remote-after ref、Environment绑定的retained Node/CLI identity、Delivery Carrier内冻结Task Contribution paths，以及blocked路径的matching resume token。不得从HEAD、dirty tree、当前diff、时间或安装结果反推贡献。

Result必须恰好属于一种模式：

- `complete`：`status=complete`、五阶段完成且Environment cleanup成功；
- `doctor-blocked`：`status=blocked`、`primaryFailure.phase=deliver`、`operation=retained-doctor`、carrier/remote readback/partial delivery完整、`delivery.status=activation-blocked`、Environment尚未cleanup且`resume.phase=deliver`包含matching token。

`doctor-blocked`只有至少一个下述动作适用时才能覆盖普通停止规则。其他blocked/failed Result、并列failure、缺失partial delivery或无动作匹配一律返回`not-applicable`并保留原Finish结论。

按规范化Workspace相对路径形成封闭动作集合：

- `sync-retained-workspace`：`projects/product/services/buildr/package/manifest.yml`或`projects/product/services/buildr/package/targets/workspace/**`；
- `install-development-local-app`：这是保留兼容的内部动作ID；用户可见能力是development Buildr Web。它由`projects/product/services/buildr/src/interfaces/local-app/**`、`projects/product/services/buildr/src/interfaces/cli/launcher.mjs`、`projects/product/services/buildr/package/launchers/**`、`projects/product/services/buildr/package.json`、`projects/product/services/buildr/package-lock.json`或`projects/product/services/buildr/LICENSE`命中；
- `verify-development-entry`：`projects/product/buildr`、`projects/product/services/buildr/bin/**`、`projects/product/services/buildr/src/**/*.mjs`、legacy CLI安装/卸载脚本、`package.json`、`package-lock.json`或任一其他self-bootstrap动作命中时，以Environment retained Node显式执行retained Project bridge，证明development launcher、CLI entry、Node、channel、source commit与package/version绑定本次retained checkout；
- `finalize`：identity验证通过后，`complete`模式通过该显式retained入口执行一次指定Agent Doctor，`doctor-blocked`模式通过同一入口恢复一次同一Finish run。

同一动作即使被多条路径命中也只执行一次。所有路径均未命中时返回`not-applicable`，不执行sync、Git、Buildr Web Dev install、development entry verification、Doctor或Finish resume。

## 执行

正常路径只启动一次本Skill携带的runner；Agent不得再逐条编排sync、commit、push、安装、Doctor或same-run resume：

```bash
<receipt-node> skills/buildr-self-bootstrap-sync/scripts/closeout.mjs \
  --run <finish-run-id> \
  --target <canonical-workspace> \
  --node-executable <receipt-node>
```

Runner是本Skill的bundled script，只存在于Buildr自举Workspace，不进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。它通过retained `projects/product/buildr task finish inspect --run ... --detail full --json`从同一run只读取得Finish Result与`resolvedContext`，不导入Product内部Application模块；随后核对Component、模式、frozen paths、target branch、remote/final ref、clean tree和retained Node identity，形成确定性plan。然后按`preflight → plan → sync → commit → push → install-local-app → verify-development-entry → finalize`执行；每阶段独立返回`passed|blocked|not-applicable`、identity、最小operations与effects，不写新authority。

在任何Git、sync、安装、Doctor或Finish resume前，命令适配层只读枚举固定根`.buildr/transient/task-finish/carriers`的直接子项。目录名只作为run候选；每个foreign真实目录都必须由同一retained Product `task finish inspect --detail full`证明Finish Result schema、run、canonical Workspace、非symlink carrier路径、carrier identity与matching resume identity。合法`cleanup_pending` predecessor形成`buildr.self-bootstrap-recovery-plan/v1`的`resume-owner-cleanup`步骤，按`taskId + runId`稳定排序，最后才是当前run的`retry-current-closeout`。计划一次展示owner、状态、所需授权、原owner command与预期effects，但当前runner只负责只读协调：不得恢复、删除或忽略foreign carrier，各cleanup仍必须由原Task Finish owner在用户授权后执行；predecessor消失后重新启动当前runner，才回到既有single-run activation。

foreign doctor-blocked、其他blocked、terminal残留或不支持状态只标记`manual-owner-review`；symlink、越界、重复realpath、inspect失败、Workspace/path/carrier/resume identity或token不可证明时标记`unprovable`且不给resume command。存在任意foreign carrier时，当前调用固定blocked，并在Git、sync、安装、Doctor、Finish resume与carrier mutation全部零副作用处停止。协调计划是ephemeral read model，不写SQLite、Receipt、Execution Record、Git或第二份队列/聚合store，也不授予跨owner mutation authority。

`install-local-app`只用Environment retained Node直接执行retained checkout中的`package/launchers/manage.mjs install --channel development`，并核对closed status、checkout source root、HEAD与development runtime executable后才继续。它不得调用npm-owned公开`buildr web launcher`命令；公开命令没有development channel。显式`npm run install:development`复用同一内部manager，因此人工development安装与post-Finish activation共享一个实现入口。

Plan的`baseRef`始终冻结为当前Finish Result的final ref，runner不因后续交付改写它。Preflight另选择本次实际`activationBaseRef`：HEAD等于base时直接使用base；HEAD已前进时，只接受base到HEAD无merge、每个first-parent commit带非空`Buildr-Task` trailer或成对`Buildr-Finish-Run`/`Buildr-Closeout-Plan` trailer、working tree clean且remote精确等于HEAD的Buildr-owned descendant。若HEAD本身是当前run/plan的精确successor，则以其parent作为activation base，remote只可等于parent或HEAD。当前sync产生的新successor必须直接以activation base为parent。这样较早Result可以在已push的后续Formal Finish或self-bootstrap successor上顺序激活，但未知commit、merge、未push descendant或remote drift仍在安装与finalize前fail closed；不增加持久queue、store或第二份lifecycle authority。

`verify-development-entry`不解析或执行PATH默认`buildr`。Runner直接执行本次retained checkout的`projects/product/buildr`，注入`BUILDR_NODE=<Environment retained Node>`，先使用closed development identity probe核对`scripts/run-development-cli`、`bin/buildr.mjs`与Node，再执行`version --json`核对development channel、source commit与retained `package.json`中的package/version。Project bridge缺失或不可执行、launcher/CLI entry/Node漂移、channel/source commit/package/version不一致或命令启动失败一律fail closed，不进入`finalize`。

`doctor-blocked`模式下，尚未cleanup的当前Delivery Carrier是Finish owner的恢复资源，不属于用户dirty tree。Runner只在`workspaceRoot + runId`推导的路径与同一Result的`carrier.root`精确匹配、真实存在且不是symlink时，从untracked observation中排除该唯一root及其后代；该路径下的tracked/staged差异、其他untracked路径、root缺失或identity不匹配仍然fail closed。此规则不写`.gitignore`或`.git/info/exclude`。

`complete`模式的`finalize`只通过已验证的retained `projects/product/buildr`运行一次指定Agent Doctor。`doctor-blocked`模式不另行运行第二个Doctor，而是由runner通过同一显式入口，使用原Task、run id和matching resume token恢复同一Formal Finish；恢复结果必须`status=complete`且cleanup完成。再次blocked时只消费runner返回的current resume事实，不重复启动本Skill或递归activation。

Runner结果是正常路径的唯一执行证据。需要诊断时只读其失败阶段、实际Git/ref/remote、产品Result与可选`recoveryPlan`；不得绕过runner独立补做阶段。multi-run plan中的owner cleanup与当前runner重试分别是独立授权点，只能调用计划声明的原owner入口，协调器不得直接删除foreign carrier。

## 失败与恢复

- staged/未知delta、symlink逃逸、HEAD/remote漂移、descendant merge、缺失Buildr provenance、current successor run/plan trailer不匹配、development entry identity不匹配、package/version不一致或launcher channel/commit不匹配时fail closed。
- 修复本runner阻塞的正式Task时，修复Task的候选验证必须覆盖显式retained Project bridge、精确Node identity、Development Launcher、sync、Doctor与doctor-blocked same-run resume链；不得把每个后续症状自动拆成新的递归修复Task。
- 不使用`git add -A`、force push或共享历史改写，不把sync delta混入原Task carrier。
- 失败时停止后续不安全动作，报告已完成动作、失败动作、冻结inputs、当前retained/remote/CLI/launcher identity与精确恢复入口。
- `complete`模式失败固定报告“主任务已交付、自举Workspace激活未完成”，不得重新运行Finish或改写已完成Result。
- `doctor-blocked`模式失败固定报告“Formal Finish仍被Doctor阻塞、自举恢复未完成”，保留Product返回的current run/resume事实；只允许上述一次same-run resume，不重跑Formal Verification、生成Candidate、执行Completion Review或改写Development handoff、decision、Task Record。
- activation evidence只存在于当前Agent执行报告；不得写入SQLite、Task Record、Development/Review/Verification、Finish JSON或新聚合store。

## 结果边界

成功消费`buildr.self-bootstrap-closeout-result/v1`并报告`passed`，包含输入模式、Formal Result/run identity、frozen paths、分类与plan identity，以及每个阶段的`passed|not-applicable`、frozen ref与actual activation base、Buildr descendant provenance、sync commit/push/readback、retained Project bridge、launcher/CLI entry/Node、channel/source commit、package/version和最终Doctor或same-run resume evidence。发现foreign carrier时报告`blocked`并additive返回ephemeral `buildr.self-bootstrap-recovery-plan/v1`；没有foreign carrier时`recoveryPlan=null`且现有结果和执行语义不变。未命中报告`not-applicable`。该结果不是新的持久authority；`complete`模式不改变Task终态，`doctor-blocked`模式只有Product resume可以形成Formal Finish终态。Task Manager继续独立管理顶层完成状态。
